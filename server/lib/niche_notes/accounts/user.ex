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

  # A guest came in through a note's link, without an account, so its id only ever comes from that link.
  def guest?(%__MODULE__{sub: sub}), do: String.starts_with?(sub, "guest:")

  def changeset(user, attrs) do
    user
    |> cast(attrs, [:sub, :name, :email])
    |> validate_required([:sub, :name])
    |> unique_constraint(:sub)
  end
end
