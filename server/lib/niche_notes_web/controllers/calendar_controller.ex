defmodule NicheNotesWeb.CalendarController do
  use NicheNotesWeb, :controller

  alias NicheNotes.{Docs, Reminders}

  @salt "calendar"

  # The address a calendar app subscribes to. Like a widget's token it never expires, and it shows only the
  # notes its person can open at the time.
  def link(conn, _params) do
    token = Phoenix.Token.sign(conn, @salt, conn.assigns.current_user_id)
    json(conn, %{url: url(~p"/calendar/#{token}")})
  end

  def show(conn, %{"token" => token}) do
    case Phoenix.Token.verify(conn, @salt, token, max_age: :infinity) do
      {:ok, user_id} ->
        conn |> put_resp_content_type("text/calendar") |> send_resp(200, calendar(user_id))

      _ ->
        send_resp(conn, :unauthorized, "")
    end
  end

  # One event per dated line: all day without a time, half an hour with one. Times carry no zone, so a
  # calendar shows 15:30 at 15:30 wherever it is, as the line reads.
  defp calendar(user_id) do
    stamp = Calendar.strftime(DateTime.utc_now(), "%Y%m%dT%H%M%SZ")

    events =
      for {id, {title, lines}} <- Map.take(Reminders.notes(), Docs.note_ids(user_id)),
          {line, n} <- Enum.with_index(lines) do
        [
          "BEGIN:VEVENT",
          "UID:#{id}-#{n}",
          "DTSTAMP:#{stamp}",
          start(line),
          "SUMMARY:#{escape(line.text)}",
          "DESCRIPTION:#{escape(title)}",
          "URL:#{url(~p"/n/#{id}")}"
        ] ++ repeat(line.repeat) ++ ["END:VEVENT"]
      end

    Enum.join(
      ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//niche-notes//EN", "X-WR-CALNAME:Niche Notes"] ++
        List.flatten(events) ++ ["END:VCALENDAR", ""],
      "\r\n"
    )
  end

  defp start(%{date: date, time: nil}),
    do: ["DTSTART;VALUE=DATE:#{Calendar.strftime(date, "%Y%m%d")}"]

  defp start(%{date: date, time: time}) do
    [
      "DTSTART:#{Calendar.strftime(NaiveDateTime.new!(date, time), "%Y%m%dT%H%M%S")}",
      "DURATION:PT30M"
    ]
  end

  defp repeat(nil), do: []
  defp repeat("weekdays"), do: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]
  defp repeat(every), do: ["RRULE:FREQ=#{String.upcase(every)}"]

  defp escape(text), do: String.replace(text, ~r/[\;,]/, "\\\\\\0")
end
