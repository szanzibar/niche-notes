defmodule NicheNotesWeb.MeControllerTest do
  use NicheNotesWeb.ConnCase

  @year 365 * 24 * 60 * 60

  test "the session cookie lasts a year, counted again from every launch", %{conn: conn} do
    conn = get(conn, "/auth/login?as=me")
    assert conn.resp_cookies["_niche_notes_key"].max_age == @year

    conn = conn |> recycle() |> get("/api/me")
    assert %{"user" => %{"name" => "Me"}} = json_response(conn, 200)
    assert conn.resp_cookies["_niche_notes_key"].max_age == @year
  end
end
