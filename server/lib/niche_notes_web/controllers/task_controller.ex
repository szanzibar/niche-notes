defmodule NicheNotesWeb.TaskController do
  use NicheNotesWeb, :controller

  alias NicheNotes.{Notebooks, Tasks}

  def index(conn, %{"notebook_id" => notebook_id}) do
    authorize!(conn, notebook_id)
    active = Tasks.list_active(notebook_id)
    json(conn, %{tasks: Enum.map(active, &task_json/1)})
  end

  def create(conn, %{"notebook_id" => notebook_id, "task" => params}) do
    authorize_edit!(conn, notebook_id)
    attrs = Map.put(params, "notebook_id", notebook_id)
    case Tasks.create_task(attrs) do
      {:ok, task} ->
        broadcast_change(notebook_id, "task_created", task_json(task))
        json(conn, %{task: task_json(task)})
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def update(conn, %{"notebook_id" => notebook_id, "id" => id, "task" => params}) do
    authorize_edit!(conn, notebook_id)
    task = Tasks.get_task!(id)
    case Tasks.update_task(task, params) do
      {:ok, task} ->
        broadcast_change(notebook_id, "task_updated", task_json(task))
        json(conn, %{task: task_json(task)})
      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: errors(changeset)})
    end
  end

  def delete(conn, %{"notebook_id" => notebook_id, "id" => id}) do
    authorize_edit!(conn, notebook_id)
    task = Tasks.get_task!(id)
    {:ok, _} = Tasks.delete_task(task)
    broadcast_change(notebook_id, "task_deleted", %{id: id})
    send_resp(conn, :no_content, "")
  end

  defp task_json(t), do: %{
    id: t.id,
    notebook_id: t.notebook_id,
    title: t.title,
    notes: t.notes,
    completed_at: t.completed_at,
    due_at: t.due_at,
    rrule: t.rrule,
    next_occurrence_at: t.next_occurrence_at,
    inserted_at: t.inserted_at,
    updated_at: t.updated_at
  }

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

  defp broadcast_change(notebook_id, event, payload) do
    NicheNotesWeb.Endpoint.broadcast("notebook:#{notebook_id}", event, payload)
  end
end
