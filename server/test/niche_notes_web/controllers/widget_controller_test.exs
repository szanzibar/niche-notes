defmodule NicheNotesWeb.WidgetControllerTest do
  use NicheNotesWeb.ConnCase

  import NicheNotesWeb.ChannelCase, only: [edit!: 2]
  alias NicheNotes.Docs

  setup %{conn: conn} do
    me = NicheNotesWeb.ChannelCase.user!("me")
    other = NicheNotesWeb.ChannelCase.user!("other")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)

    edit!(note, fn doc ->
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

  defp read(token),
    do: build_conn() |> put_req_header("authorization", "Bearer " <> token) |> get("/api/widget")

  defp token(conn, note),
    do: json_response(get(conn, "/api/docs/#{note}/widget_token"), 200)["token"]

  test "a widget reads its note with the token the picker got", %{conn: conn, note: note} do
    assert json_response(read(token(conn, note)), 200) == %{
             "title" => "Groceries",
             "lines" => ["☑ milk"],
             "texts" => ["milk"]
           }
  end

  test "a note that hides its checked items leaves them out", %{conn: conn, note: note} do
    edit!(note, fn doc ->
      Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "hideChecked", true)
      eggs = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from("eggs")])
      Yex.XmlFragment.push(Yex.Doc.get_xml_fragment(doc, "content"), eggs)
    end)

    assert json_response(read(token(conn, note)), 200)["lines"] == ["eggs"]
  end

  test "a note that deletes its checked items leaves them out too", %{conn: conn, note: note} do
    edit!(note, fn doc -> Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "deleteChecked", true) end)

    assert json_response(read(token(conn, note)), 200)["lines"] == []
  end

  test "a checked item stays while an item under it is unchecked, without its checked ones", %{
    conn: conn,
    note: note
  } do
    item = fn text, checked, nested ->
      paragraph = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])
      Yex.XmlElementPrelim.new("taskItem", [paragraph | nested], %{"checked" => checked})
    end

    edit!(note, fn doc ->
      Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "hideChecked", true)

      nested =
        Yex.XmlElementPrelim.new("taskList", [
          item.("socks", true, []),
          item.("charger", false, [])
        ])

      Yex.XmlFragment.push(
        Yex.Doc.get_xml_fragment(doc, "content"),
        Yex.XmlElementPrelim.new("taskList", [item.("trip", true, [nested])])
      )
    end)

    assert %{"lines" => ["☑ trip", "    ☐ charger"], "texts" => ["trip", "charger"]} =
             json_response(read(token(conn, note)), 200)
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

    edit!(note, &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "deleted", true))
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
