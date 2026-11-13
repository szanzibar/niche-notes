defmodule NicheNotesWeb.GoogleCalendarControllerTest do
  use NicheNotesWeb.ConnCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1]
  alias NicheNotes.Repo
  alias NicheNotes.GoogleCalendar.Connection

  test "Connect goes through Google's consent, makes a Niche Notes calendar, and Disconnect deletes it",
       %{conn: conn} do
    me = user!("me")
    test = self()

    Req.Test.stub(NicheNotes.GoogleCalendar, fn conn ->
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      send(test, {conn.method, conn.host, conn.request_path, body})

      case {conn.method, conn.request_path} do
        {"POST", "/token"} ->
          Req.Test.json(conn, %{
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3599
          })

        {"GET", "/v1/userinfo"} ->
          Req.Test.json(conn, %{sub: "1", email: "me@example.com"})

        {"POST", "/calendar/v3/calendars"} ->
          Req.Test.json(conn, %{id: "cal@group.calendar.google.com"})

        {"DELETE", _} ->
          Plug.Conn.send_resp(conn, 204, "")

        {"POST", "/revoke"} ->
          Plug.Conn.send_resp(conn, 200, "")
      end
    end)

    conn =
      conn |> init_test_session(%{user_id: me.id}) |> get("/auth/google?time_zone=Europe/Zurich")

    google = URI.parse(redirected_to(conn, 302))
    params = URI.decode_query(google.query)
    assert google.host == "accounts.google.com"
    assert params["scope"] == "openid email https://www.googleapis.com/auth/calendar.app.created"
    assert %{"access_type" => "offline", "prompt" => "consent", "client_id" => "client"} = params

    conn = conn |> recycle() |> get("/auth/google/callback", code: "code", state: params["state"])
    assert redirected_to(conn, 302) == "/"
    assert_received {"POST", "oauth2.googleapis.com", "/token", exchange}
    assert URI.decode_query(exchange)["code"] == "code"
    assert_received {"POST", "www.googleapis.com", "/calendar/v3/calendars", calendar}
    assert %{"summary" => "Niche Notes", "timeZone" => "Europe/Zurich"} = Jason.decode!(calendar)

    assert %Connection{calendar_id: "cal@group.calendar.google.com"} = Repo.get(Connection, me.id)
    conn = conn |> recycle() |> get("/api/google_calendar")
    assert json_response(conn, 200) == %{"email" => "me@example.com"}

    conn = conn |> recycle() |> delete("/api/google_calendar")
    assert response(conn, 204)
    assert_received {"DELETE", _, "/calendar/v3/calendars/cal%40group.calendar.google.com", _}
    assert_received {"POST", _, "/revoke", "token=refresh"}
    refute Repo.get(Connection, me.id)
  end
end
