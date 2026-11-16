defmodule NicheNotesWeb.AuthControllerTest do
  use NicheNotesWeb.ConnCase

  setup do
    Application.put_env(:niche_notes, :oidc,
      client_id: "client",
      base_url: "https://id.example",
      redirect_uri: "https://notes.example/auth/callback",
      authorization_params: [scope: "profile email"],
      openid_configuration: %{"authorization_endpoint" => "https://id.example/authorize"}
    )

    on_exit(fn -> Application.delete_env(:niche_notes, :oidc) end)
  end

  # Outside prod the router sends /auth/login to the dev login, so the real one is called with the session loaded.
  defp prompt(conn) do
    conn =
      conn
      |> recycle()
      |> bypass_through(NicheNotesWeb.Router, :browser)
      |> get("/auth/login")
      |> NicheNotesWeb.AuthController.login(%{})

    URI.decode_query(URI.parse(redirected_to(conn, 302)).query)["prompt"]
  end

  test "after Sign out, the next login asks which account to use", %{conn: conn} do
    conn = get(conn, "/auth/login?as=me")
    assert prompt(conn) == nil

    conn = conn |> recycle() |> delete("/auth/logout")
    assert response(conn, 204)
    assert json_response(conn |> recycle() |> get("/api/me"), 401)
    assert prompt(conn) == "select_account"
  end
end
