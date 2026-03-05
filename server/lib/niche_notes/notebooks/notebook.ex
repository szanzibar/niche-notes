defmodule NicheNotes.Notebooks.Notebook do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "notebooks" do
    field :title, :string
    field :type, :string

    belongs_to :owner, NicheNotes.Accounts.User
    has_many :members, NicheNotes.Notebooks.NotebookMember

    timestamps(type: :utc_datetime)
  end

  def changeset(notebook, attrs) do
    notebook
    |> cast(attrs, [:title, :type, :owner_id])
    |> validate_required([:title, :type, :owner_id])
    |> validate_inclusion(:type, ["notes", "tasks"])
  end
end
