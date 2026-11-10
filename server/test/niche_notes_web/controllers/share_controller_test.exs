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

  test "only the owner empties a note from the trash", %{conn: conn, other: other, note: note} do
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})
    assert as_other |> delete("/api/docs/#{note}") |> json_response(403)
    assert conn |> delete("/api/docs/#{note}") |> response(204)
    assert conn |> delete("/api/docs/#{note}") |> json_response(403)
  end

  defp json_keys(conn) do
    for s <- json_response(conn, 200)["shares"],
        do: %{doc_id: s["doc_id"], user_id: s["user_id"], owner_id: s["owner_id"]}
  end
end
