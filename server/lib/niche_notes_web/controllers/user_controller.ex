defmodule NicheNotesWeb.UserController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  def index(conn, _params) do
    users = for u <- Accounts.list_users(), do: %{id: u.id, name: u.name}
    json(conn, %{users: users})
  end
end
