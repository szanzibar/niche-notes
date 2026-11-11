defmodule NicheNotesWeb.WidgetControllerTest do
  use NicheNotesWeb.ConnCase

  alias NicheNotes.Docs

  setup %{conn: conn} do
    me = NicheNotesWeb.ChannelCase.user!("me")
    other = NicheNotesWeb.ChannelCase.user!("other")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)

    edit(note, fn doc ->
      Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "title", "Groceries")
      milk = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from("milk")])
      item = Yex.XmlElementPrelim.new("taskItem", [milk], %{"checked" => true})

      Yex.XmlFragment.push(
        Yex.Doc.get_xml_fragment(doc, "content"),
        Yex.XmlElementPrelim.new("taskList", [item])
      )
    end)

    %{
      conn: Plug.Test.init_test_session(conn, %{user_id: me.id}),
      me: me,
      other: other,
      note: note
    }
  end

  # Applies the change on top of the note's log and stores it, the way a device would.
  defp edit(note, change) do
    doc = Yex.Doc.new()
    {rows, _} = Docs.updates_since(note, 0)
    for {_, update} <- rows, do: :ok = Yex.apply_update(doc, update)
    {:ok, before} = Yex.encode_state_vector(doc)
    change.(doc)
    {:ok, update} = Yex.encode_state_as_update(doc, before)
    Docs.append_update(note, update)
  end

  defp read(token),
    do: build_conn() |> put_req_header("authorization", "Bearer " <> token) |> get("/api/widget")

  defp token(conn, note),
    do: json_response(get(conn, "/api/docs/#{note}/widget_token"), 200)["token"]

  test "a widget reads its note with the token the picker got", %{conn: conn, note: note} do
    assert json_response(read(token(conn, note)), 200) == %{
             "title" => "Groceries",
             "lines" => ["☑ milk"]
           }
  end

  test "a token stops reading once the note is unshared or in the trash", %{
    conn: conn,
    me: me,
    other: other,
    note: note
  } do
    {:ok, _} = Docs.share(note, me.id, other.id)
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})
    theirs = token(as_other, note)
    mine = token(conn, note)
    assert json_response(read(theirs), 200)

    {:ok, _} = Docs.unshare(note, me.id, other.id)
    assert json_response(read(theirs), 404)
    assert json_response(read(mine), 200)

    edit(note, &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "deleted", true))
    assert json_response(read(mine), 404)
  end

  test "only someone who can open the note gets a token, and the widget takes no other", %{
    me: me,
    other: other,
    note: note
  } do
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})
    assert json_response(get(as_other, "/api/docs/#{note}/widget_token"), 403)

    assert json_response(get(build_conn(), "/api/widget"), 401)
    assert json_response(read("forged"), 401)
    assert json_response(read(NicheNotesWeb.UserSocket.token(@endpoint, me.id)), 401)
  end
end
