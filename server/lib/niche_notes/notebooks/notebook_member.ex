defmodule NicheNotes.Notebooks.NotebookMember do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "notebook_members" do
    belongs_to :notebook, NicheNotes.Notebooks.Notebook
    belongs_to :user, NicheNotes.Accounts.User
    field :role, :string

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def changeset(member, attrs) do
    member
    |> cast(attrs, [:notebook_id, :user_id, :role])
    |> validate_required([:notebook_id, :user_id, :role])
    |> validate_inclusion(:role, ["viewer", "editor"])
    |> unique_constraint([:notebook_id, :user_id])
  end
end
