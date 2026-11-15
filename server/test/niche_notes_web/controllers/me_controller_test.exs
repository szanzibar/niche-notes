defmodule NicheNotesWeb.MeControllerTest do
  use NicheNotesWeb.ConnCase

  @year 365 * 24 * 60 * 60

  test "the session cookie lasts a year, counted again from every launch, and only this site can set it",
       %{conn: conn} do
    conn = get(conn, "/auth/login?as=me")
    assert %{max_age: @year, secure: true} = conn.resp_cookies["__Host-niche_notes"]

    conn = conn |> recycle() |> get("/api/me")
    assert %{"user" => %{"name" => "Me", "guest" => false}} = json_response(conn, 200)
    assert conn.resp_cookies["__Host-niche_notes"].max_age == @year
  end
end
