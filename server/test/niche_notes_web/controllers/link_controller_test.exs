defmodule NicheNotesWeb.LinkControllerTest do
  use NicheNotesWeb.ConnCase

  alias NicheNotes.{Accounts, Docs}
  alias NicheNotesWeb.ChannelCase

  setup %{conn: conn} do
    me = ChannelCase.user!("me")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    %{conn: Plug.Test.init_test_session(conn, %{user_id: me.id}), me: me, note: note}
  end

  test "an edit link signs a visitor in as a named guest with that note, until the owner turns it off",
       %{conn: conn, note: note} do
    assert %{"links" => []} = conn |> get("/api/docs/#{note}/links") |> json_response(200)
    link = create(conn, note, false)

    visitor = get(build_conn(), "/s/#{link}")
    assert redirected_to(visitor) == "/n/#{note}#link"
    guest = Accounts.get_user(get_session(visitor, :user_id))
    assert guest.name =~ ~r/^[A-Z][a-z]+ [A-Z][a-z]+$/
    assert Docs.can_edit?(note, guest.id)

    assert %{"links" => [%{"token" => ^link, "read_only" => false, "visitors" => [visited]}]} =
             conn |> get("/api/docs/#{note}/links") |> json_response(200)

    assert visited["name"] == guest.name

    # Opening it again in the same browser is the same guest.
    assert visitor |> recycle() |> get("/s/#{link}") |> get_session(:user_id) == guest.id

    # Turning it off also ends the guest's open channel on the note.
    channel = ChannelCase.open_channel(guest, note)
    assert conn |> delete("/api/docs/#{note}/links/#{link}") |> response(204)
    assert_receive {:DOWN, _, :process, ^channel, _}
    refute Docs.can_access?(note, guest.id)
    assert build_conn() |> get("/s/#{link}") |> response(404)
  end

  test "turning off one link leaves the guests of another", %{conn: conn, note: note} do
    first = create(conn, note, false)
    second = create(conn, note, true)
    stays = build_conn() |> get("/s/#{first}") |> get_session(:user_id)
    goes = build_conn() |> get("/s/#{second}") |> get_session(:user_id)

    assert conn |> delete("/api/docs/#{note}/links/#{second}") |> response(204)
    assert Docs.can_access?(note, stays)
    refute Docs.can_access?(note, goes)

    assert %{"links" => [%{"token" => ^first}]} =
             conn |> get("/api/docs/#{note}/links") |> json_response(200)
  end

  test "a view link's guest reads the note, and an edit link lets them edit", %{
    conn: conn,
    note: note
  } do
    view = create(conn, note, true)
    visitor = build_conn() |> get("/s/#{view}")
    guest = get_session(visitor, :user_id)
    assert Docs.can_access?(note, guest)
    refute Docs.can_edit?(note, guest)
    assert :error = Docs.change_line(note, guest, "2026-11-21", "line", [{"checked", true}])

    # Edit wins, whichever link comes first.
    visitor
    |> recycle()
    |> get("/s/#{create(conn, note, false)}")
    |> recycle()
    |> get("/s/#{view}")

    assert Docs.can_edit?(note, guest)
  end

  test "sharing by name lets someone who came by a view link edit", %{
    conn: conn,
    me: me,
    note: note
  } do
    other = ChannelCase.user!("other")
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})
    as_other |> get("/s/#{create(conn, note, true)}")
    refute Docs.can_edit?(note, other.id)

    {:ok, _} = Docs.share(note, me.id, other.id)
    assert Docs.can_edit?(note, other.id)
  end

  test "a guest is told only who owns the notes they were let into", %{
    conn: conn,
    me: me,
    note: note
  } do
    ChannelCase.user!("other")
    link = create(conn, note, false)
    as_guest = build_conn() |> get("/s/#{link}") |> recycle()

    assert %{"users" => [%{"id" => id}]} = as_guest |> get("/api/users") |> json_response(200)
    assert id == me.id

    assert conn |> delete("/api/docs/#{note}/links/#{link}") |> response(204)
    assert %{"users" => []} = as_guest |> get("/api/users") |> json_response(200)
  end

  test "someone with an account who opens a link keeps the note when it is turned off", %{
    conn: conn,
    note: note
  } do
    other = ChannelCase.user!("other")
    link = create(conn, note, false)

    opened =
      build_conn() |> Plug.Test.init_test_session(%{user_id: other.id}) |> get("/s/#{link}")

    assert redirected_to(opened) == "/n/#{note}#link"
    assert conn |> delete("/api/docs/#{note}/links/#{link}") |> response(204)
    assert Docs.can_edit?(note, other.id)
  end

  test "only the owner sees or changes a note's links, the tree has none, and a token is long", %{
    me: me,
    note: note,
    conn: conn
  } do
    link = create(conn, note, false)
    other = ChannelCase.user!("other")
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})

    body = %{token: "aaaaaaaaaaaaaaaa", read_only: true}

    assert as_other |> get("/api/docs/#{note}/links") |> json_response(403)
    assert as_other |> post("/api/docs/#{note}/links", body) |> json_response(403)
    assert as_other |> delete("/api/docs/#{note}/links/#{link}") |> json_response(403)
    assert conn |> post("/api/docs/#{me.id}/links", body) |> json_response(403)
    assert conn |> post("/api/docs/#{note}/links", %{body | token: "short"}) |> json_response(403)
  end

  defp create(conn, note, read_only) do
    token = Base.url_encode64(:crypto.strong_rand_bytes(12), padding: false)
    body = %{token: token, read_only: read_only}
    assert conn |> post("/api/docs/#{note}/links", body) |> response(204)
    token
  end
end
