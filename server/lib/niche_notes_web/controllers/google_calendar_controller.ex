defmodule NicheNotesWeb.GoogleCalendarController do
  use NicheNotesWeb, :controller

  require Logger
  alias NicheNotes.{Accounts, GoogleCalendar}

  # The browser the desktop app sent to Google may have no session, so the hand-off comes before the sign-in check.
  plug NicheNotesWeb.Plugs.HandOff,
       [state: ["google", :session_params, :state]] when action == :callback

  plug NicheNotesWeb.Plugs.RequireAuth when action in [:connect, :callback]

  # A guest has one note and no calendar of their own.
  def connect(conn, params) do
    if Accounts.User.guest?(Accounts.get_user(conn.assigns.current_user_id)) do
      send_resp(conn, :forbidden, "")
    else
      {:ok, %{url: url, session_params: session_params}} = GoogleCalendar.connect_url()

      conn
      |> put_session(:google, %{session_params: session_params, time_zone: params["time_zone"]})
      |> redirect(external: url)
    end
  end

  # Back to the notes either way. Settings shows whether it worked.
  def callback(conn, params) do
    %{session_params: session_params, time_zone: time_zone} = get_session(conn, :google)
    user_id = conn.assigns.current_user_id

    with error when error != :ok <-
           GoogleCalendar.connect(user_id, params, session_params, time_zone) do
      Logger.warning("Connecting Google Calendar failed: #{inspect(error)}")
    end

    conn |> delete_session(:google) |> redirect(to: "/")
  end

  def show(conn, _params),
    do: json(conn, %{email: GoogleCalendar.email(conn.assigns.current_user_id)})

  def delete(conn, _params) do
    GoogleCalendar.disconnect(conn.assigns.current_user_id)
    send_resp(conn, :no_content, "")
  end
end
