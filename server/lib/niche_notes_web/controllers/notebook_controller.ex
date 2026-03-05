defmodule NicheNotesWeb.NotebookController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Notebooks

  def index(conn, _params) do
    notebooks = Notebooks.list_for_user(conn.assigns.current_user_id)
    json(conn, %{notebooks: Enum.map(notebooks, &notebook_json/1)})
  end

  def show(conn, %{"id" => id}) do
    notebook = Notebooks.get_notebook!(id)
    authorize!(conn, notebook)
    json(conn, %{notebook: notebook_json(notebook)})
  end

  def create(conn, %{"notebook" => params}) do
    attrs = Map.put(params, "owner_id", conn.assigns.current_user_id)
    case Notebooks.create_notebook(attrs) do
      {:ok, notebook} -> json(conn, %{notebook: notebook_json(notebook)})
      {:error, changeset} -> conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def update(conn, %{"id" => id, "notebook" => params}) do
    notebook = Notebooks.get_notebook!(id)
    authorize_owner!(conn, notebook)
    case Notebooks.update_notebook(notebook, params) do
      {:ok, notebook} -> json(conn, %{notebook: notebook_json(notebook)})
      {:error, changeset} -> conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def delete(conn, %{"id" => id}) do
    notebook = Notebooks.get_notebook!(id)
    authorize_owner!(conn, notebook)
    {:ok, _} = Notebooks.delete_notebook(notebook)
    send_resp(conn, :no_content, "")
  end

  def members(conn, %{"id" => notebook_id}) do
    authorize_access!(conn, notebook_id)
    members = Notebooks.list_members(notebook_id)
    json(conn, %{members: Enum.map(members, &member_json/1)})
  end

  def add_member(conn, %{"id" => notebook_id, "user_id" => user_id, "role" => role}) do
    authorize_owner_by_id!(conn, notebook_id)
    case Notebooks.add_member(notebook_id, user_id, role) do
      {:ok, member} -> json(conn, %{member: member_json(member)})
      {:error, changeset} -> conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def remove_member(conn, %{"id" => notebook_id, "user_id" => user_id}) do
    authorize_owner_by_id!(conn, notebook_id)
    case Notebooks.remove_member(notebook_id, user_id) do
      {:ok, _} -> send_resp(conn, :no_content, "")
      {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "not found"})
    end
  end

  # Serialization

  defp notebook_json(n), do: %{
    id: n.id,
    title: n.title,
    type: n.type,
    owner_id: n.owner_id,
    inserted_at: n.inserted_at,
    updated_at: n.updated_at
  }
  defp member_json(m), do: %{user_id: m.user_id, role: m.role, name: m.user.name}
  defp errors(cs), do: Ecto.Changeset.traverse_errors(cs, &elem(&1, 0))

  # Authorization helpers

  defp authorize!(conn, notebook) do
    unless Notebooks.can_access?(notebook.id, conn.assigns.current_user_id) do
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"}) |> halt()
    end
  end

  defp authorize_owner!(conn, notebook) do
    unless notebook.owner_id == conn.assigns.current_user_id do
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"}) |> halt()
    end
  end

  defp authorize_access!(conn, notebook_id) do
    unless Notebooks.can_access?(notebook_id, conn.assigns.current_user_id) do
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"}) |> halt()
    end
  end

  defp authorize_owner_by_id!(conn, notebook_id) do
    notebook = Notebooks.get_notebook!(notebook_id)
    authorize_owner!(conn, notebook)
  end
end
