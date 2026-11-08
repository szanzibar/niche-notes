defmodule NicheNotes.Accounts do
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Accounts.User
  alias NicheNotes.Docs.Doc

  def get_user(id), do: Repo.get(User, id)

  def list_users do
    Repo.all(from u in User, order_by: u.name)
  end

  def find_or_create_user(%{"sub" => sub, "name" => name} = claims) do
    case Repo.get_by(User, sub: sub) do
      nil -> create_user(%{sub: sub, name: name, email: claims["email"]})
      user -> {:ok, user}
    end
  end

  # A user's tree doc shares the user's id, and creating it here keeps anyone else from claiming that id first.
  defp create_user(attrs) do
    Repo.transaction(fn ->
      with {:ok, user} <- Repo.insert(User.changeset(%User{}, attrs)),
           {:ok, _tree} <- Repo.insert(%Doc{id: user.id, owner_id: user.id}) do
        user
      else
        {:error, changeset} -> Repo.rollback(changeset)
      end
    end)
  end
end
