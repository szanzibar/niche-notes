defmodule NicheNotes.Reminders do
  @moduledoc """
  Every dated checkbox line, held in memory for alerts and calendars. Once a minute it rereads the notes that
  changed, then alerts everyone on a note about each line that came due since the last pass: at its time, or
  at 9:00 without one, in each device's own time zone. A repeating line also alerts on each of its rule's
  days after its date until someone ticks it, so a missed day doesn't silence the next ones. Ticking moves its
  date past them.

  Boot reads every note once, a few seconds at family scale. Someone who left a note still gets its alerts
  until they leave it for good.
  """
  use GenServer
  alias NicheNotes.{Docs, Push}

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  # %{doc_id => {title, lines}}, for the notes that have any. It waits out the first read of every note at boot.
  def notes, do: GenServer.call(__MODULE__, :notes, :infinity)

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
        subscription <- Push.subscriptions(Docs.member_ids(id)),
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
        repeat: line.repeat
      })
    end

    %{state | at: now}
  end

  defp reread(%{notes: notes, seen: seen} = state) do
    {changed, seen} = Docs.changed_since(seen)

    notes =
      Enum.reduce(changed, notes, fn id, notes ->
        case Docs.dated_lines(id) do
          {_title, []} -> Map.delete(notes, id)
          found -> Map.put(notes, id, found)
        end
      end)

    %{state | notes: notes, seen: seen}
  end

  # A time that a clock change skips alerts just after it, and one it repeats alerts the first time.
  defp due_at(date, time, time_zone) do
    case DateTime.new(date, time || ~T[09:00:00], time_zone) do
      {:ok, at} -> at
      {:ambiguous, first, _} -> first
      {:gap, _, after_gap} -> after_gap
    end
  end

  @days ~w(MO TU WE TH FR SA SU)

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
