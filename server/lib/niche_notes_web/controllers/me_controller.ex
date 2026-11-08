defmodule NicheNotesWeb.MeController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  def show(conn, _params) do
    user = Accounts.get_user(conn.assigns.current_user_id)

    json(conn, %{
      user: %{id: user.id, name: user.name, email: user.email},
      token: NicheNotesWeb.UserSocket.token(conn, user.id)
    })
  end
end
