defmodule NicheNotesWeb.ShareControllerTest do
  use NicheNotesWeb.ConnCase

  alias NicheNotes.Docs

  setup %{conn: conn} do
    me = NicheNotesWeb.ChannelCase.user!("me")
    other = NicheNotesWeb.ChannelCase.user!("other")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    conn = conn |> Plug.Test.init_test_session(%{user_id: me.id})
    %{conn: conn, me: me, other: other, note: note}
  end

  test "owner shares and unshares a note", %{conn: conn, me: me, other: other, note: note} do
    assert conn |> post("/api/docs/#{note}/shares", %{user_id: other.id}) |> response(201)
    assert Docs.can_access?(note, other.id)

    assert [%{doc_id: ^note, user_id: other_id, owner_id: me_id}] =
             json_keys(get(conn, "/api/shares"))

    assert {other_id, me_id} == {other.id, me.id}

    assert conn |> delete("/api/docs/#{note}/shares/#{other.id}") |> response(204)
    refute Docs.can_access?(note, other.id)
  end

  test "the person a note is shared with hears about it on each device with alerts on", %{
    conn: conn,
    me: me,
    other: other,
    note: note
  } do
    for {user, place} <- [{other, "phone"}, {other, "laptop"}, {me, "mine"}] do
      {public, _} = :crypto.generate_key(:ecdh, :prime256v1)

      keys = %{
        "p256dh" => Base.url_encode64(public, padding: false),
        "auth" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
      }

      {:ok, _} =
        NicheNotes.Push.subscribe(
          user.id,
          %{"endpoint" => "https://push.example/#{place}", "keys" => keys},
          "Europe/Zurich"
        )
    end

    test = self()

    Req.Test.stub(NicheNotes.Push, fn push ->
      send(test, {:push, push.request_path})
      Plug.Conn.send_resp(push, 201, "")
    end)

    assert conn |> post("/api/docs/#{note}/shares", %{user_id: other.id}) |> response(201)
    assert_received {:push, "/phone"}
    assert_received {:push, "/laptop"}
    refute_received {:push, _}
  end

  test "only the owner shares, and never the tree", %{
    conn: conn,
    me: me,
    other: other,
    note: note
  } do
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})

    assert as_other
           |> post("/api/docs/#{note}/shares", %{user_id: other.id})
           |> json_response(403)

    assert conn |> post("/api/docs/#{me.id}/shares", %{user_id: other.id}) |> json_response(403)

    assert conn
           |> post("/api/docs/#{note}/shares", %{user_id: Ecto.UUID.generate()})
           |> json_response(404)
  end

  test "a recipient can leave a shared note, but not remove anyone else", %{
    conn: _conn,
    me: me,
    other: other,
    note: note
  } do
    third = NicheNotesWeb.ChannelCase.user!("third")
    {:ok, _} = Docs.share(note, me.id, other.id)
    {:ok, _} = Docs.share(note, me.id, third.id)
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})

    assert as_other |> delete("/api/docs/#{note}/shares/#{third.id}") |> json_response(403)
    assert as_other |> delete("/api/docs/#{note}/shares/#{other.id}") |> response(204)
    refute Docs.can_access?(note, other.id)
    assert Docs.can_access?(note, third.id)
  end

  test "unsharing ends the other person's open channel on the note, and nobody else's", %{
    conn: conn,
    me: me,
    other: other,
    note: note
  } do
    {:ok, _} = Docs.share(note, me.id, other.id)

    [mine, theirs] =
      for user <- [me, other], do: NicheNotesWeb.ChannelCase.open_channel(user, note)

    assert conn |> delete("/api/docs/#{note}/shares/#{other.id}") |> response(204)
    assert_receive {:DOWN, _, :process, ^theirs, _}
    assert Process.alive?(mine)
  end

  test "only the owner empties a note, and only one the server's copy has in the trash", %{
    conn: conn,
    other: other,
    note: note
  } do
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})

    trash = fn deleted ->
      NicheNotesWeb.ChannelCase.edit!(
        note,
        &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "deleted", deleted)
      )
    end

    assert conn |> delete("/api/docs/#{note}") |> json_response(403)
    trash.(true)
    assert as_other |> delete("/api/docs/#{note}") |> json_response(403)

    # Restored on another device since this one last looked.
    trash.(false)
    assert conn |> delete("/api/docs/#{note}") |> json_response(403)

    trash.(true)
    assert conn |> delete("/api/docs/#{note}") |> response(204)
    assert conn |> delete("/api/docs/#{note}") |> json_response(403)
  end

  test "the API answers only our own pages, and a form can't pose as a delete", %{
    conn: conn,
    other: other,
    note: note
  } do
    share = fn site ->
      conn
      |> put_req_header("sec-fetch-site", site)
      |> post("/api/docs/#{note}/shares", %{user_id: other.id})
    end

    assert share.("same-site") |> response(403)
    assert share.("cross-site") |> response(403)
    refute Docs.can_access?(note, other.id)
    assert share.("same-origin") |> response(201)

    assert conn
           |> put_req_header("content-type", "application/x-www-form-urlencoded")
           |> post("/api/docs/#{note}", "_method=delete")
           |> response(404)

    assert NicheNotes.Repo.get(Docs.Doc, note)
  end

  defp json_keys(conn) do
    for s <- json_response(conn, 200)["shares"],
        do: %{doc_id: s["doc_id"], user_id: s["user_id"], owner_id: s["owner_id"]}
  end
end
