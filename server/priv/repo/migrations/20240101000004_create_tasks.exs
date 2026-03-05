defmodule NicheNotes.Repo.Migrations.CreateTasks do
  use Ecto.Migration

  def change do
    create table(:tasks, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :notebook_id, references(:notebooks, type: :binary_id, on_delete: :delete_all), null: false
      add :title, :text, null: false
      add :notes, :text
      add :completed_at, :utc_datetime
      add :due_at, :utc_datetime
      add :rrule, :text
      add :next_occurrence_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end

    create index(:tasks, [:notebook_id])
    create index(:tasks, [:notebook_id], where: "completed_at IS NULL", name: :tasks_active_index)
    create index(:tasks, [:next_occurrence_at], where: "next_occurrence_at IS NOT NULL")
  end
end
