defmodule NicheNotesWeb.LinkControllerTest do
  use NicheNotesWeb.ConnCase

  alias NicheNotes.{Accounts, Docs}

  setup %{conn: conn} do
    me = NicheNotesWeb.ChannelCase.user!("me")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    %{conn: Plug.Test.init_test_session(conn, %{user_id: me.id}), me: me, note: note}
  end

  test "a link signs a visitor in as a named guest with that note, until the owner turns it off",
       %{
         conn: conn,
         note: note
       } do
    assert %{"link" => nil} = conn |> get("/api/docs/#{note}/link") |> json_response(200)
    %{"link" => link} = conn |> put("/api/docs/#{note}/link") |> json_response(200)
    assert %{"link" => ^link} = conn |> put("/api/docs/#{note}/link") |> json_response(200)

    visitor = get(build_conn(), "/s/#{link}")
    assert redirected_to(visitor) == "/n/#{note}"
    guest = Accounts.get_user(get_session(visitor, :user_id))
    assert guest.name =~ ~r/^[A-Z][a-z]+ [A-Z][a-z]+$/
    assert Docs.can_access?(note, guest.id)

    assert %{"guest" => true} =
             conn |> get("/api/users") |> json_response(200) |> guest_named(guest.name)

    # Opening it again in the same browser is the same guest.
    assert visitor |> recycle() |> get("/s/#{link}") |> get_session(:user_id) == guest.id

    assert conn |> delete("/api/docs/#{note}/link") |> response(204)
    refute Docs.can_access?(note, guest.id)
    assert build_conn() |> get("/s/#{link}") |> response(404)
  end

  test "someone with an account who opens the link keeps the note when it is turned off", %{
    conn: conn,
    note: note
  } do
    other = NicheNotesWeb.ChannelCase.user!("other")
    %{"link" => link} = conn |> put("/api/docs/#{note}/link") |> json_response(200)

    opened =
      build_conn() |> Plug.Test.init_test_session(%{user_id: other.id}) |> get("/s/#{link}")

    assert redirected_to(opened) == "/n/#{note}"
    assert conn |> delete("/api/docs/#{note}/link") |> response(204)
    assert Docs.can_access?(note, other.id)
  end

  test "only the owner sees or changes a note's link, and the tree has none", %{
    me: me,
    note: note,
    conn: conn
  } do
    other = NicheNotesWeb.ChannelCase.user!("other")
    as_other = Plug.Test.init_test_session(build_conn(), %{user_id: other.id})

    assert as_other |> get("/api/docs/#{note}/link") |> json_response(403)
    assert as_other |> put("/api/docs/#{note}/link") |> json_response(403)
    assert as_other |> delete("/api/docs/#{note}/link") |> json_response(403)
    assert conn |> put("/api/docs/#{me.id}/link") |> json_response(403)
  end

  defp guest_named(%{"users" => users}, name), do: Enum.find(users, &(&1["name"] == name))
end
