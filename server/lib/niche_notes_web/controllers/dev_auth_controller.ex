defmodule NicheNotesWeb.DevAuthController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  # Instantly signs in as a local dev user — no Pocket ID required.
  # Only reachable in dev (router gates it with Mix.env() == :dev).
  def login(conn, _params) do
    {:ok, user} =
      Accounts.find_or_create_user(%{
        "sub" => "dev-user-1",
        "name" => "Dev User",
        "email" => "dev@localhost"
      })

    conn
    |> put_session(:user_id, user.id)
    |> redirect(to: "/")
  end
end
