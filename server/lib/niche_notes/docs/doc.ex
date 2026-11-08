defmodule NicheNotes.Docs.Doc do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: false}
  @foreign_key_type :binary_id

  schema "docs" do
    belongs_to :owner, NicheNotes.Accounts.User
    timestamps(type: :utc_datetime, updated_at: false)
  end
end
