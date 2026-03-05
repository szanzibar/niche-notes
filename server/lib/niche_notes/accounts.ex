defmodule NicheNotes.Accounts do
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Accounts.User

  def get_user(id), do: Repo.get(User, id)

  def find_or_create_user(%{"sub" => sub, "name" => name} = claims) do
    case Repo.get_by(User, sub: sub) do
      nil ->
        %User{}
        |> User.changeset(%{sub: sub, name: name, email: claims["email"]})
        |> Repo.insert()

      user ->
        {:ok, user}
    end
  end

  def list_users do
    Repo.all(from u in User, order_by: u.name)
  end
end
