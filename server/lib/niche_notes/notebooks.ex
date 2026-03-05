defmodule NicheNotes.Notebooks do
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Notebooks.{Notebook, NotebookMember}

  # Returns all notebooks visible to a user (owned or shared)
  def list_for_user(user_id) do
    owned = from n in Notebook, where: n.owner_id == ^user_id
    shared = from n in Notebook,
      join: m in NotebookMember, on: m.notebook_id == n.id,
      where: m.user_id == ^user_id

    (Repo.all(owned) ++ Repo.all(shared))
    |> Enum.uniq_by(& &1.id)
    |> Enum.sort_by(& &1.title)
  end

  def get_notebook!(id), do: Repo.get!(Notebook, id)

  def create_notebook(attrs) do
    %Notebook{}
    |> Notebook.changeset(attrs)
    |> Repo.insert()
  end

  def update_notebook(notebook, attrs) do
    notebook
    |> Notebook.changeset(attrs)
    |> Repo.update()
  end

  def delete_notebook(notebook), do: Repo.delete(notebook)

  def list_members(notebook_id) do
    Repo.all(
      from m in NotebookMember,
        where: m.notebook_id == ^notebook_id,
        preload: [:user]
    )
  end

  def add_member(notebook_id, user_id, role) do
    %NotebookMember{}
    |> NotebookMember.changeset(%{notebook_id: notebook_id, user_id: user_id, role: role})
    |> Repo.insert()
  end

  def remove_member(notebook_id, user_id) do
    case Repo.get_by(NotebookMember, notebook_id: notebook_id, user_id: user_id) do
      nil -> {:error, :not_found}
      member -> Repo.delete(member)
    end
  end

  # Check if a user can access a notebook (owner or member)
  def can_access?(notebook_id, user_id) do
    notebook = Repo.get!(Notebook, notebook_id)
    notebook.owner_id == user_id or
      Repo.exists?(from m in NotebookMember,
        where: m.notebook_id == ^notebook_id and m.user_id == ^user_id)
  end

  def can_edit?(notebook_id, user_id) do
    notebook = Repo.get!(Notebook, notebook_id)
    notebook.owner_id == user_id or
      Repo.exists?(from m in NotebookMember,
        where: m.notebook_id == ^notebook_id and m.user_id == ^user_id and m.role == "editor")
  end
end
