defmodule NicheNotes.Reminders do
  @moduledoc """
  Every dated checkbox line, held in memory for alerts and calendars. Once a minute it rereads the notes that
  changed, then alerts everyone on a note about each line that came due since the last pass: at its time, or
  at 9:00 without one, in each device's own time zone. A line assigned to someone on the note is theirs alone.
  Rereading a note also tells whoever was just assigned a task in it. A repeating line also alerts on each of its rule's
  days after its date until someone ticks it, so a missed day doesn't silence the next ones. Ticking moves its
  date past them.

  Boot reads every note once, a few seconds at family scale. Someone who left a note still gets its alerts
  until they leave it for good.
  """
  use GenServer
  alias NicheNotes.{Accounts, Docs, Push}

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  # %{doc_id => {title, lines}}: the notes this person can open that have lines of theirs. It waits out the first
  # read of every note at boot.
  def notes_for(user_id) do
    notes = GenServer.call(__MODULE__, :notes, :infinity)

    for {id, {title, lines}} <- Map.take(notes, Docs.note_ids(user_id)),
        members = Docs.member_ids(id),
        into: %{},
        do: {id, {title, Enum.filter(lines, &(user_id in people(&1, members)))}}
  end

  # Whom a line is for: its assignee while they are on the note, otherwise everyone on it.
  defp people(%{assignee: assignee}, members),
    do: if(assignee in members, do: [assignee], else: members)

  # Looks back a few minutes, so a restart doesn't skip what came due while it was down. A device shows an
  # alert sent twice in place of the first.
  @impl true
  def init(nil) do
    send(self(), :pass)
    {:ok, %{notes: %{}, seen: 0, at: DateTime.add(DateTime.utc_now(), -5, :minute)}}
  end

  @impl true
  def handle_info(:pass, state) do
    Process.send_after(self(), :pass, :timer.minutes(1))
    {:noreply, pass(state, DateTime.utc_now())}
  end

  # Google Calendar gets lines as they are now, not as of the last pass.
  @impl true
  def handle_call(:notes, _from, state) do
    state = reread(state)
    {:reply, state.notes, state}
  end

  @doc false
  def pass(state, now) do
    %{notes: notes, at: from} = state = reread(state)

    # Every time zone's date is within a day of UTC's.
    today = DateTime.to_date(now)

    for {id, {title, lines}} <- notes,
        line <- lines,
        date <- Date.range(Date.add(today, -1), Date.add(today, 1)),
        date == line.date or
          (line.repeat != nil and Date.after?(date, line.date) and
             occurs?(line.repeat, line.date, date)),
        subscription <- Push.subscriptions(people(line, Docs.member_ids(id))),
        at = due_at(date, line.time, subscription.time_zone),
        DateTime.after?(at, from) and not DateTime.after?(at, now) do
      text = String.slice(line.text, 0, 200)

      # Each day gets its own tag, since one that matches yesterday's alert replaces it without a sound.
      Push.send(subscription, %{
        title: text,
        body: title,
        note: id,
        tag: "#{id} #{date} #{line.time} #{text}",
        due: line.due,
        text: text,
        repeat: line.repeat,
        next: next_due(line, date)
      })
    end

    %{state | at: now}
  end

  defp reread(%{notes: notes, seen: seen} = state) do
    {changed, seen} = Docs.changed_since(seen)

    notes =
      Enum.reduce(changed, notes, fn id, notes ->
        for assignment <- Docs.take_assignments(id), do: tell_assignee(id, assignment)

        case Docs.dated_lines(id) do
          {_title, []} -> Map.delete(notes, id)
          found -> Map.put(notes, id, found)
        end
      end)

    %{state | notes: notes, seen: seen}
  end

  # Like a share's alert, on every device of theirs with alerts on, and a tap opens the note at the line. Someone
  # taken off the note before this pass hears nothing.
  defp tell_assignee(id, %{assignee: assignee, by: by, text: text, title: title}) do
    with true <- assignee in Docs.member_ids(id),
         %{name: name} <- Accounts.get_user(by) do
      [first_name | _] = String.split(name, " ")
      text = String.slice(text, 0, 200)

      for subscription <- Push.subscriptions([assignee]) do
        Push.send(subscription, %{
          title: "#{first_name} assigned you a task in #{title}",
          body: text,
          note: id,
          text: text,
          tag: "assigned #{id} #{text}"
        })
      end
    end
  end

  # A time that a clock change skips alerts just after it, and one it repeats alerts the first time.
  defp due_at(date, time, time_zone) do
    case DateTime.new(date, time || ~T[09:00:00], time_zone) do
      {:ok, at} -> at
      {:ambiguous, first, _} -> first
      {:gap, _, after_gap} -> after_gap
    end
  end

  # Where Done moves a repeating line, at its time, for an app that can't read the rule itself: the rule's first day
  # after `from`. Nil for a line that doesn't repeat.
  def next_due(%{repeat: nil}, _from), do: nil

  def next_due(line, from) do
    next = next(line.repeat, line.date, from)
    next && String.replace(line.due, ~r/^[\d-]+/, Date.to_iso8601(next))
  end

  @days ~w(MO TU WE TH FR SA SU)

  # The rule's first day after `from`, or after `start` when that is later, as the app's `nextDue` in dates.ts
  # finds it. Five years without one means the rule never comes round.
  @doc false
  def next(rule, start, from) do
    Enum.max([start, from], Date)
    |> Stream.iterate(&Date.add(&1, 1))
    |> Stream.drop(1)
    |> Stream.take(5 * 366)
    |> Enum.find(&occurs?(rule, start, &1))
  end

  # Whether `date` is one of the rule's days, counting intervals from `start`. The app's `occurs` in
  # dates.ts says the same, and the tests hold both to the same cases.
  @doc false
  def occurs?(rule, start, date) do
    parts = rule |> String.split(";") |> Map.new(&List.to_tuple(String.split(&1, "=", parts: 2)))
    interval = String.to_integer(parts["INTERVAL"] || "1")
    by_day = String.split(parts["BYDAY"] || "", ",", trim: true)
    days = Enum.map(by_day, &String.slice(&1, -2, 2))

    weeks =
      by_day
      |> Enum.map(&String.slice(&1, 0..-3//1))
      |> Enum.reject(&(&1 == ""))
      |> Enum.map(&String.to_integer/1)

    weekday = Enum.at(@days, Date.day_of_week(date) - 1)
    months = (date.year - start.year) * 12 + date.month - start.month

    case parts["FREQ"] do
      "WEEKLY" ->
        apart = div(Date.diff(Date.beginning_of_week(date), Date.beginning_of_week(start)), 7)

        rem(apart, interval) == 0 and
          weekday in if(days == [], do: [Enum.at(@days, Date.day_of_week(start) - 1)], else: days)

      "YEARLY" ->
        rem(months, 12 * interval) == 0 and date.day == start.day

      "MONTHLY" when rem(months, interval) != 0 ->
        false

      "MONTHLY" when weeks == [] ->
        date.day == String.to_integer(parts["BYMONTHDAY"] || "#{start.day}")

      "MONTHLY" ->
        nth = div(date.day + 6, 7)
        last = date.day + 7 > Date.days_in_month(date)
        weekday in days and Enum.any?(weeks, &(&1 == nth or (&1 == -1 and last)))
    end
  end
end
