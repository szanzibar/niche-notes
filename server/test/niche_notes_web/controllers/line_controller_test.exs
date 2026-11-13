defmodule NicheNotesWeb.LineControllerTest do
  use NicheNotesWeb.ConnCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1, edit!: 2]
  alias NicheNotes.Docs

  test "an alert's buttons tick its line or move its date, and apps with the note open get the change",
       %{conn: conn} do
    me = user!("me")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)

    edit!(note, fn doc ->
      items =
        for text <- ["Pay rent", "Call the plumber"] do
          paragraph = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])

          Yex.XmlElementPrelim.new("taskItem", [paragraph], %{
            "checked" => false,
            "due" => "2026-11-14"
          })
        end

      Yex.XmlFragment.push(
        Yex.Doc.get_xml_fragment(doc, "content"),
        Yex.XmlElementPrelim.new("taskList", items)
      )
    end)

    NicheNotesWeb.Endpoint.subscribe("doc:#{note}")
    conn = Plug.Test.init_test_session(conn, %{user_id: me.id})
    line = "/api/docs/#{note}/line"

    assert response(patch(conn, line, %{due: "2026-11-14", text: "Pay rent", checked: true}), 204)
    assert_receive %Phoenix.Socket.Broadcast{event: "update"}

    assert response(
             patch(conn, line, %{
               due: "2026-11-14",
               text: "Call the plumber",
               move_to: "2026-11-14T15:30"
             }),
             204
           )

    assert {_title, [%{text: "Call the plumber", due: "2026-11-14T15:30"}]} =
             Docs.dated_lines(note)

    # A line that changed since the alert, and someone else's note, are left alone.
    assert response(patch(conn, line, %{due: "2026-11-14", text: "Pay rent", checked: true}), 404)
    stranger = Plug.Test.init_test_session(build_conn(), %{user_id: user!("other").id})

    assert response(
             patch(stranger, line, %{
               due: "2026-11-14T15:30",
               text: "Call the plumber",
               checked: true
             }),
             404
           )
  end
end
