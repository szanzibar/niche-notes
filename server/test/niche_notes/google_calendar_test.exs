defmodule NicheNotes.GoogleCalendarTest do
  use NicheNotes.DataCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1, edit!: 2]
  alias NicheNotes.{Docs, GoogleCalendar, Reminders}
  alias NicheNotes.GoogleCalendar.Connection

  @events "/calendar/v3/calendars/cal%40group.calendar.google.com/events"

  setup do
    me = user!("me")

    Repo.insert!(%Connection{
      user_id: me.id,
      calendar_id: "cal@group.calendar.google.com",
      email: "me@example.com",
      refresh_token:
        Plug.Crypto.encrypt(NicheNotesWeb.Endpoint.config(:secret_key_base), "google", "refresh"),
      time_zone: "Europe/Zurich"
    })

    start_supervised!(Reminders)
    %{me: me}
  end

  # Answers like Google, with `listed` as the calendar's events, and reports each request to the test.
  defp google(listed) do
    test = self()

    Req.Test.stub(GoogleCalendar, fn conn ->
      conn = Plug.Conn.fetch_query_params(conn)
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      send(test, {conn.method, conn.request_path, body})

      case {conn.method, conn.request_path} do
        {"POST", "/token"} -> Req.Test.json(conn, %{access_token: "access", expires_in: 3599})
        {"GET", @events} -> Req.Test.json(conn, %{items: listed})
        {"POST", @events} -> Req.Test.json(conn, %{id: "new"})
        {"DELETE", @events <> _} -> Plug.Conn.send_resp(conn, 204, "")
      end
    end)
  end

  test "a person's dated lines become events in their calendar, and a ticked line takes its event away",
       %{me: me} do
    other = user!("other")
    note = Ecto.UUID.generate()
    theirs = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    {:ok, _} = Docs.open(theirs, other.id)

    for {doc, text} <- [{note, "Pay rent, then bills"}, {theirs, "Not for me"}] do
      edit!(doc, fn doc ->
        Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "title", "House")

        items =
          for {line, attrs} <- [
                {text,
                 %{
                   "checked" => false,
                   "due" => "2026-11-14",
                   "repeat" => "FREQ=MONTHLY;BYDAY=1SU,3SU"
                 }},
                {"Call the plumber", %{"checked" => false, "due" => "2026-11-14T15:30"}},
                {"See the dentist",
                 %{"checked" => false, "due" => "2026-11-15T09:00", "duration" => 90}}
              ] do
            paragraph = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(line)])
            Yex.XmlElementPrelim.new("taskItem", [paragraph], attrs)
          end

        Yex.XmlFragment.push(
          Yex.Doc.get_xml_fragment(doc, "content"),
          Yex.XmlElementPrelim.new("taskList", items)
        )
      end)
    end

    stale = %{"id" => "stale", "extendedProperties" => %{"private" => %{"key" => "gone"}}}
    google([stale, %{"id" => "by-hand"}])
    synced = GoogleCalendar.sync(%{})

    assert_received {"POST", "/token", form}
    assert URI.decode_query(form)["refresh_token"] == "refresh"
    assert_received {"GET", @events, _}
    assert_received {"DELETE", @events <> "/stale", _}
    refute_received {"DELETE", @events <> "/by-hand", _}

    link = "#{NicheNotesWeb.Endpoint.url()}/n/#{note}?line="

    assert_received {"POST", @events, one}
    assert_received {"POST", @events, two}
    assert_received {"POST", @events, three}
    refute_received {"POST", @events, _}

    %{"Pay rent, then bills" => rent, "Call the plumber" => plumber, "See the dentist" => dentist} =
      Map.new([one, two, three], &{Jason.decode!(&1)["summary"], Jason.decode!(&1)})

    assert %{
             "summary" => "Pay rent, then bills",
             "description" => "House\nEdit in Niche Notes: " <> rent_link,
             "start" => %{"date" => "2026-11-14"},
             "end" => %{"date" => "2026-11-15"},
             "recurrence" => ["RRULE:FREQ=MONTHLY;BYDAY=1SU,3SU"],
             "reminders" => %{"useDefault" => false},
             "extendedProperties" => %{"private" => %{"key" => rent_key}}
           } = rent

    assert rent_link == link <> "Pay+rent%2C+then+bills"

    assert %{
             "start" => %{"dateTime" => "2026-11-14T15:30:00", "timeZone" => "Europe/Zurich"},
             "end" => %{"dateTime" => "2026-11-14T16:00:00", "timeZone" => "Europe/Zurich"},
             "recurrence" => [],
             "extendedProperties" => %{"private" => %{"key" => plumber_key}}
           } = plumber

    assert %{
             "end" => %{"dateTime" => "2026-11-15T10:30:00"},
             "extendedProperties" => %{"private" => %{"key" => dentist_key}}
           } = dentist

    # Nothing changed, so Google hears nothing.
    assert GoogleCalendar.sync(synced) == synced
    refute_received {_, _, _}

    {:ok, _, _} =
      Docs.change_line(note, me.id, "2026-11-14T15:30", "Call the plumber", [{"checked", true}])

    google([
      %{"id" => "rent", "extendedProperties" => %{"private" => %{"key" => rent_key}}},
      %{"id" => "plumber", "extendedProperties" => %{"private" => %{"key" => plumber_key}}},
      %{"id" => "dentist", "extendedProperties" => %{"private" => %{"key" => dentist_key}}}
    ])

    GoogleCalendar.sync(synced)
    assert_received {"DELETE", @events <> "/plumber", _}
    refute_received {"DELETE", _, _}
    refute_received {"POST", @events, _}
  end

  test "a person who removed the app's access is disconnected, so Settings offers Connect again",
       %{me: me} do
    Req.Test.stub(GoogleCalendar, fn conn ->
      conn |> Plug.Conn.put_status(400) |> Req.Test.json(%{error: "invalid_grant"})
    end)

    GoogleCalendar.sync(%{})
    refute Repo.get(Connection, me.id)
  end
end
