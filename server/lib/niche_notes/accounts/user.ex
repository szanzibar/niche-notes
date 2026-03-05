defmodule NicheNotes.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "users" do
    field :sub, :string
    field :name, :string
    field :email, :string

    timestamps(type: :utc_datetime)
  end

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:sub, :name, :email])
    |> validate_required([:sub, :name])
    |> unique_constraint(:sub)
  end
end
