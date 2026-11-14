defmodule NicheNotesWeb.UserController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts
  alias NicheNotes.Accounts.User

  def index(conn, _params) do
    users = for u <- Accounts.list_users(), do: %{id: u.id, name: u.name, guest: User.guest?(u)}
    json(conn, %{users: users})
  end
end
