defmodule NicheNotesWeb.DevAuthController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  # Dev and test only. `/auth/login?as=wife` signs in a second user so sharing can be tried locally.
  def login(conn, params) do
    name = params["as"] || "dev"

    {:ok, user} =
      Accounts.find_or_create_user(%{
        "sub" => "dev-" <> name,
        "name" => String.capitalize(name),
        "email" => name <> "@localhost"
      })

    conn |> put_session(:user_id, user.id) |> redirect(to: "/")
  end
end
