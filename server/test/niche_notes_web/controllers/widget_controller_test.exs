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
             "color" => "#FF4F3B",
             "ink" => "#FFFFFF",
             "rows" => [%{"line" => "milk", "text" => "milk", "depth" => 0, "checked" => true}]
           }
  end

  test "a heading carries its level, and a blank line stays between lines but not at either end",
       %{
         conn: conn,
         note: note
       } do
    paragraph = fn text ->
      Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])
    end

    edit!(note, fn doc ->
      content = Yex.Doc.get_xml_fragment(doc, "content")
      Yex.XmlFragment.insert(content, 0, paragraph.(""))

      Yex.XmlFragment.insert(
        content,
        1,
        Yex.XmlElementPrelim.new("heading", [Yex.XmlTextPrelim.from("Shop")], %{"level" => 2})
      )

      Yex.XmlFragment.push(content, paragraph.(""))
      Yex.XmlFragment.push(content, paragraph.("bread"))
      Yex.XmlFragment.push(content, paragraph.(""))
    end)

    assert [
             %{"line" => "Shop", "heading" => 2},
             %{"line" => "milk"},
             %{"line" => ""},
             %{"line" => "bread"}
           ] = json_response(read(token(conn, note)), 200)["rows"]
  end

  test "a note that hides its checked items leaves them out", %{conn: conn, note: note} do
    edit!(note, fn doc ->
      Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "hideChecked", true)
      eggs = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from("eggs")])
      Yex.XmlFragment.push(Yex.Doc.get_xml_fragment(doc, "content"), eggs)
    end)

    assert [%{"line" => "eggs"}] = json_response(read(token(conn, note)), 200)["rows"]
  end

  test "a note that deletes its checked items leaves them out too", %{conn: conn, note: note} do
    edit!(note, fn doc -> Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "deleteChecked", true) end)

    assert json_response(read(token(conn, note)), 200)["rows"] == []
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

    assert [
             %{"line" => "trip", "depth" => 0, "checked" => true},
             %{"line" => "charger", "depth" => 1, "checked" => false}
           ] = json_response(read(token(conn, note)), 200)["rows"]
  end

  test "a table row is one line, its cells apart", %{conn: conn, note: note} do
    cell = fn text ->
      Yex.XmlElementPrelim.new("tableCell", [
        Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])
      ])
    end

    row = fn texts -> Yex.XmlElementPrelim.new("tableRow", Enum.map(texts, cell)) end

    edit!(note, fn doc ->
      Yex.XmlFragment.push(
        Yex.Doc.get_xml_fragment(doc, "content"),
        Yex.XmlElementPrelim.new("table", [row.(["Dose", "Yield"]), row.(["18g", "36g"])])
      )
    end)

    assert [_milk, %{"line" => "Dose | Yield"}, %{"line" => "18g | 36g"}] =
             json_response(read(token(conn, note)), 200)["rows"]
  end

  test "a widget wears the color its user's app gives the note", %{conn: conn, me: me, note: note} do
    {:ok, _} = Docs.open(me.id, me.id)

    set = fn map, key, value ->
      edit!(me.id, &Yex.Map.set(Yex.Doc.get_map(&1, map), key, value))
    end

    colors = fn id -> Map.take(json_response(read(token(conn, id)), 200), ["color", "ink"]) end

    set.("settings", "accent", "#1A9E5C")
    assert colors.(note) == %{"color" => "#1A9E5C", "ink" => "#FFFFFF"}

    set.("nodes", note, %{"parent" => nil, "order" => 1, "color" => "#FFD23F"})
    assert colors.(note) == %{"color" => "#FFD23F", "ink" => "#111111"}

    # The app gives this id Sky under Confetti.
    unpicked = "7d3c2a1e-9f4b-4c8d-a6e5-0b1f2c3d4e5f"
    {:ok, _} = Docs.open(unpicked, me.id)
    set.("settings", "scheme", "confetti")
    assert colors.(unpicked) == %{"color" => "#6CC6FF", "ink" => "#111111"}
    assert colors.(me.id) == %{"color" => "#1A9E5C", "ink" => "#FFFFFF"}
  end

  test "the user's own tree reads as their notes, the way their tree draws them", %{
    conn: conn,
    me: me,
    other: other
  } do
    {:ok, _} = Docs.open(me.id, me.id)

    note = fn title, owner, meta ->
      id = Ecto.UUID.generate()
      {:ok, _} = Docs.open(id, owner.id)

      edit!(id, fn doc ->
        for {k, v} <- [{"title", title} | meta],
            do: Yex.Map.set(Yex.Doc.get_map(doc, "meta"), k, v)
      end)

      id
    end

    place = fn id, node -> edit!(me.id, &Yex.Map.set(Yex.Doc.get_map(&1, "nodes"), id, node)) end

    [old, new, pinned, kid, folded, hidden] =
      for t <- ~w(Old New Pinned Kid Folded Hidden), do: note.(t, me, [])

    place.(old, %{"parent" => nil, "order" => 1})
    place.(new, %{"parent" => nil, "order" => 3})
    place.(pinned, %{"parent" => nil, "order" => 0, "pinned" => true})
    place.(kid, %{"parent" => new, "order" => 1})
    place.(folded, %{"parent" => old, "order" => 1, "collapsed" => true})
    place.(hidden, %{"parent" => folded, "order" => 1})
    place.(note.("Deleted", me, [{"deleted", true}]), %{"parent" => nil, "order" => 4})
    place.(note.("Theirs", other, []), %{"parent" => nil, "order" => 5})

    left = note.("Left", other, [])
    {:ok, _} = Docs.share(left, other.id, me.id)
    place.(left, %{"parent" => nil, "order" => 6, "leftAt" => 1})

    assert %{"title" => "Notes", "rows" => rows} = json_response(read(token(conn, me.id)), 200)

    assert rows == [
             %{"line" => "Pinned", "depth" => 0, "note" => pinned},
             %{"line" => "New", "depth" => 0, "note" => new},
             %{"line" => "Kid", "depth" => 1, "note" => kid},
             %{"line" => "Old", "depth" => 0, "note" => old},
             %{"line" => "Folded", "depth" => 1, "note" => folded}
           ]
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

  test "a Due widget reads every open dated line with the tree's token, the earliest first", %{
    conn: conn,
    me: me,
    other: other,
    note: groceries
  } do
    start_supervised!(NicheNotes.Reminders)
    {:ok, _} = Docs.open(me.id, me.id)

    dated = fn id, title, lines ->
      edit!(id, fn doc ->
        Yex.Map.set(Yex.Doc.get_map(doc, "meta"), "title", title)

        items =
          for {text, attrs} <- lines do
            paragraph = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])
            Yex.XmlElementPrelim.new("taskItem", [paragraph], Map.put(attrs, "checked", false))
          end

        Yex.XmlFragment.push(
          Yex.Doc.get_xml_fragment(doc, "content"),
          Yex.XmlElementPrelim.new("taskList", items)
        )
      end)
    end

    dated.(groceries, "Groceries", [
      {"eggs", %{"due" => "2026-11-22T09:00"}},
      {String.duplicate("a", 250), %{"due" => "2026-11-20"}},
      {"no date", %{}}
    ])

    house = Ecto.UUID.generate()
    {:ok, _} = Docs.open(house, other.id)
    {:ok, _} = Docs.share(house, other.id, me.id)
    dated.(house, "House", [{"bins", %{"due" => "2026-11-18", "repeat" => "FREQ=WEEKLY"}}])

    left = Ecto.UUID.generate()
    {:ok, _} = Docs.open(left, other.id)
    {:ok, _} = Docs.share(left, other.id, me.id)
    dated.(left, "Left", [{"gone", %{"due" => "2026-11-19"}}])
    edit!(me.id, &Yex.Map.set(Yex.Doc.get_map(&1, "nodes"), left, %{"leftAt" => 1}))

    theirs = Ecto.UUID.generate()
    {:ok, _} = Docs.open(theirs, other.id)
    dated.(theirs, "Theirs", [{"not mine", %{"due" => "2026-11-19"}}])

    due = fn token ->
      build_conn()
      |> put_req_header("authorization", "Bearer " <> token)
      |> get("/api/widget/due?today=2026-11-21")
    end

    assert json_response(due.(token(conn, me.id)), 200) == %{
             "color" => "#FF4F3B",
             "ink" => "#FFFFFF",
             "rows" => [
               %{
                 "note" => house,
                 "title" => "House",
                 "text" => "bins",
                 "due" => "2026-11-18",
                 "next" => "2026-11-25"
               },
               %{
                 "note" => groceries,
                 "title" => "Groceries",
                 "text" => String.duplicate("a", 200),
                 "due" => "2026-11-20",
                 "next" => nil
               },
               %{
                 "note" => groceries,
                 "title" => "Groceries",
                 "text" => "eggs",
                 "due" => "2026-11-22T09:00",
                 "next" => nil
               }
             ]
           }

    assert json_response(due.(token(conn, groceries)), 401)
  end
end
