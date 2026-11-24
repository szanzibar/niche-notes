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
  defp login(conn) do
    conn
    |> recycle()
    |> bypass_through(NicheNotesWeb.Router, :browser)
    |> get("/auth/login")
    |> NicheNotesWeb.AuthController.login(%{})
  end

  defp asked(conn, param), do: URI.decode_query(URI.parse(redirected_to(conn, 302)).query)[param]
  defp prompt(conn), do: conn |> login() |> asked("prompt")

  test "after Sign out, the next login asks which account to use", %{conn: conn} do
    conn = get(conn, "/auth/login?as=me")
    assert prompt(conn) == nil

    conn = conn |> recycle() |> delete("/auth/logout")
    assert response(conn, 204)
    assert json_response(conn |> recycle() |> get("/api/me"), 401)
    assert prompt(conn) == "select_account"
  end

  test "a callback goes on to the desktop app from a browser that didn't start the login", %{
    conn: conn
  } do
    window = login(conn)
    query = "code=code&state=#{asked(window, "state")}"

    browser = get(conn, "/auth/callback?" <> query)

    assert html_response(browser, 200) =~
             ~s(href="nichenotes://callback?#{String.replace(query, "&", "&amp;")}")

    assert %{value: "1", http_only: false, same_site: "Lax"} = browser.resp_cookies["app"]

    # The window that started it runs the callback, which fails here for want of a Pocket ID.
    assert window |> recycle() |> get("/auth/callback?#{query}&app=1") |> json_response(400)

    # A link the window never asked for only reloads the notes.
    assert conn |> get("/auth/callback?#{query}&app=1") |> redirected_to(302) == "/"
  end
end
