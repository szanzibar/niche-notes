defmodule NicheNotesWeb.GoogleCalendarController do
  use NicheNotesWeb, :controller

  require Logger
  alias NicheNotes.GoogleCalendar

  def connect(conn, params) do
    {:ok, %{url: url, session_params: session_params}} = GoogleCalendar.connect_url()

    conn
    |> put_session(:google, %{session_params: session_params, time_zone: params["time_zone"]})
    |> redirect(external: url)
  end

  # Back to the notes either way. Settings shows whether it worked.
  def callback(conn, params) do
    %{session_params: session_params, time_zone: time_zone} = get_session(conn, :google)
    user_id = get_session(conn, :user_id)

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
