defmodule NicheNotesWeb.MeController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  def show(conn, _params) do
    user = Accounts.get_user(conn.assigns.current_user_id)

    # Every launch asks for this, so a session lasts a year past the last use.
    conn
    |> configure_session(renew: true)
    |> json(%{
      user: %{id: user.id, name: user.name, email: user.email},
      token: NicheNotesWeb.UserSocket.token(conn, user.id)
    })
  end
end
