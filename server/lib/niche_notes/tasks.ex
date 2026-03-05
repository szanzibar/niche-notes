defmodule NicheNotes.Tasks do
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Tasks.Task

  def list_active(notebook_id) do
    Repo.all(
      from t in Task,
        where: t.notebook_id == ^notebook_id and is_nil(t.completed_at),
        order_by: [asc_nulls_last: t.due_at, asc: t.inserted_at]
    )
  end

  def list_completed(notebook_id) do
    Repo.all(
      from t in Task,
        where: t.notebook_id == ^notebook_id and not is_nil(t.completed_at),
        order_by: [desc: t.completed_at],
        limit: 50
    )
  end

  def get_task!(id), do: Repo.get!(Task, id)

  def create_task(attrs) do
    %Task{}
    |> Task.changeset(attrs)
    |> Repo.insert()
  end

  def update_task(task, attrs) do
    task
    |> Task.changeset(attrs)
    |> Repo.update()
  end

  def complete_task(task) do
    task
    |> Task.changeset(%{completed_at: DateTime.utc_now() |> DateTime.truncate(:second)})
    |> Repo.update()
  end

  def delete_task(task), do: Repo.delete(task)
end
