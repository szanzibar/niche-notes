defmodule NicheNotes.Tasks.Task do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "tasks" do
    field :title, :string
    field :notes, :string
    field :completed_at, :utc_datetime
    field :due_at, :utc_datetime
    field :rrule, :string
    field :next_occurrence_at, :utc_datetime

    belongs_to :notebook, NicheNotes.Notebooks.Notebook

    timestamps(type: :utc_datetime)
  end

  def changeset(task, attrs) do
    task
    |> cast(attrs, [:title, :notes, :notebook_id, :completed_at, :due_at, :rrule, :next_occurrence_at])
    |> validate_required([:title, :notebook_id])
  end
end
