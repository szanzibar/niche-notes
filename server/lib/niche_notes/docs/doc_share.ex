defmodule NicheNotes.Docs.DocShare do
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id

  schema "doc_shares" do
    belongs_to :doc, NicheNotes.Docs.Doc, primary_key: true
    belongs_to :user, NicheNotes.Accounts.User, primary_key: true
    timestamps(type: :utc_datetime, updated_at: false)
  end
end
