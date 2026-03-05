defmodule NicheNotesWeb.NoteController do
  use NicheNotesWeb, :controller

  alias NicheNotes.{Notebooks, Notes}

  def index(conn, %{"notebook_id" => notebook_id}) do
    authorize!(conn, notebook_id)
    notes = Notes.list_notes(notebook_id)
    json(conn, %{notes: Enum.map(notes, &note_list_json/1)})
  end

  def show(conn, %{"notebook_id" => notebook_id, "id" => id}) do
    authorize!(conn, notebook_id)
    note = Notes.get_note!(id)
    json(conn, %{note: note_json(note)})
  end

  def create(conn, %{"notebook_id" => notebook_id, "note" => params}) do
    authorize_edit!(conn, notebook_id)
    attrs = Map.put(params, "notebook_id", notebook_id)
    case Notes.create_note(attrs) do
      {:ok, note} -> conn |> put_status(:created) |> json(%{note: note_json(note)})
      {:error, changeset} -> conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def update(conn, %{"notebook_id" => notebook_id, "id" => id, "note" => params}) do
    authorize_edit!(conn, notebook_id)
    note = Notes.get_note!(id)
    case Notes.update_note(note, %{title: params["title"], content_text: params["content_text"]}) do
      {:ok, note} -> json(conn, %{note: note_json(note)})
      {:error, changeset} -> conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def delete(conn, %{"notebook_id" => notebook_id, "id" => id}) do
    authorize_edit!(conn, notebook_id)
    note = Notes.get_note!(id)
    {:ok, _} = Notes.delete_note(note)
    send_resp(conn, :no_content, "")
  end

  # List view omits ydoc_state (large binary)
  defp note_list_json(n), do: %{id: n.id, title: n.title, notebook_id: n.notebook_id, updated_at: n.updated_at}
  defp note_json(n), do: %{id: n.id, title: n.title, notebook_id: n.notebook_id, content_text: n.content_text, ydoc_state: n.ydoc_state && Base.encode64(n.ydoc_state), updated_at: n.updated_at}
  defp errors(cs), do: Ecto.Changeset.traverse_errors(cs, &elem(&1, 0))

  defp authorize!(conn, notebook_id) do
    unless Notebooks.can_access?(notebook_id, conn.assigns.current_user_id) do
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"}) |> halt()
    end
  end

  defp authorize_edit!(conn, notebook_id) do
    unless Notebooks.can_edit?(notebook_id, conn.assigns.current_user_id) do
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"}) |> halt()
    end
  end
end
