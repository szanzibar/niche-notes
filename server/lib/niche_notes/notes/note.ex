defmodule NicheNotes.Notes.Note do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "notes" do
    field :title, :string
    field :ydoc_updates, {:array, :binary}, default: []
    field :content_text, :string

    belongs_to :notebook, NicheNotes.Notebooks.Notebook

    timestamps(type: :utc_datetime)
  end

  def changeset(note, attrs) do
    note
    |> cast(attrs, [:title, :notebook_id, :content_text])
    |> validate_required([:title, :notebook_id])
  end
end
