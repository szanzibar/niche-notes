defmodule NicheNotesWeb.CalendarControllerTest do
  use NicheNotesWeb.ConnCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1, edit!: 2]
  alias NicheNotes.Docs

  test "a calendar link shows the dated lines of every note its person can open", %{conn: conn} do
    me = user!("me")
    other = user!("other")
    mine = Ecto.UUID.generate()
    theirs = Ecto.UUID.generate()
    {:ok, _} = Docs.open(mine, me.id)
    {:ok, _} = Docs.open(theirs, other.id)

    for {note, text} <- [{mine, "Pay rent, then bills"}, {theirs, "Not for me"}] do
      edit!(note, fn doc ->
        Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "title", "House")

        items =
          for {line, attrs} <- [
                {text,
                 %{
                   "checked" => false,
                   "due" => "2026-11-14",
                   "repeat" => "FREQ=MONTHLY;BYDAY=1SU,3SU"
                 }},
                {"Call the plumber", %{"checked" => false, "due" => "2026-11-14T15:30"}}
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

    start_supervised!(NicheNotes.Reminders)
    conn = Plug.Test.init_test_session(conn, %{user_id: me.id})
    %{"url" => url} = json_response(get(conn, "/api/calendar"), 200)
    path = URI.parse(url).path
    feed = build_conn() |> get(path) |> response(200)

    link = "#{NicheNotesWeb.Endpoint.url()}/n/#{mine}?line=Pay+rent%2C+then+bills"

    assert feed =~
             "DTSTART;VALUE=DATE:20261114\r\nSUMMARY:Pay rent\\, then bills\r\nDESCRIPTION:House\\n#{link}\r\nURL:#{link}\r\n"

    assert feed =~ "RRULE:FREQ=MONTHLY;BYDAY=1SU,3SU\r\n"
    assert feed =~ "DTSTART:20261114T153000\r\nDURATION:PT30M\r\nSUMMARY:Call the plumber\r\n"
    refute feed =~ "Not for me"
    assert response(get(build_conn(), path <> "x"), 401)
  end
end
