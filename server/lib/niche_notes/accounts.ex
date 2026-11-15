defmodule NicheNotes.Accounts do
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Accounts.User
  alias NicheNotes.Docs.{Doc, DocShare}

  def get_user(id), do: Repo.get(User, id)

  # Everyone, to share with and to name on a note. A guest shares with nobody, so they get only the owners
  # of the notes a link let them into.
  def list_users(for_id) do
    if User.guest?(get_user(for_id)) do
      Repo.all(
        from u in User,
          join: d in Doc,
          on: d.owner_id == u.id,
          join: s in DocShare,
          on: s.doc_id == d.id,
          where: s.user_id == ^for_id,
          distinct: true
      )
    else
      Repo.all(from u in User, order_by: u.name)
    end
  end

  def find_or_create_user(%{"sub" => sub, "name" => name} = claims) do
    case Repo.get_by(User, sub: sub) do
      nil -> create_user(%{sub: sub, name: name, email: claims["email"]})
      user -> {:ok, user}
    end
  end

  @colors ~w(Amber Coral Indigo Jade Olive Plum Ruby Saffron Slate Teal)
  @animals ~w(Badger Fox Gecko Heron Koala Lynx Otter Panda Puffin Walrus)

  # Named like "Teal Otter", so a guest's cursor reads as someone without them typing a name.
  def create_guest do
    name = "#{Enum.random(@colors)} #{Enum.random(@animals)}"
    create_user(%{sub: "guest:" <> Ecto.UUID.generate(), name: name})
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
