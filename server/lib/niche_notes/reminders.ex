defmodule NicheNotes.Reminders do
  @moduledoc """
  Every dated checkbox line, held in memory for alerts and calendars. Once a minute it rereads the notes that
  changed, then alerts everyone on a note about each line that came due since the last pass: at its time, or
  at 9:00 without one, in each device's own time zone. Repeats need nothing here, since ticking a repeating
  line moves its date.

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
        abs(Date.diff(line.date, today)) <= 1,
        subscription <- Push.subscriptions(Docs.member_ids(id)),
        at = due_at(line, subscription.time_zone),
        DateTime.after?(at, from) and not DateTime.after?(at, now) do
      text = String.slice(line.text, 0, 200)

      Push.send(subscription, %{
        title: text,
        body: title,
        note: id,
        tag: "#{id} #{line.due} #{text}",
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
  defp due_at(line, time_zone) do
    case DateTime.new(line.date, line.time || ~T[09:00:00], time_zone) do
      {:ok, at} -> at
      {:ambiguous, first, _} -> first
      {:gap, _, after_gap} -> after_gap
    end
  end
end
