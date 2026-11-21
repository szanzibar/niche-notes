defmodule NicheNotes.Docs.DocShare do
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id

  schema "doc_shares" do
    belongs_to :doc, NicheNotes.Docs.Doc, primary_key: true
    belongs_to :user, NicheNotes.Accounts.User, primary_key: true
    field :read_only, :boolean, default: false
    # The link that let them in, so turning it off takes the note from its guests.
    field :link, :string
    timestamps(type: :utc_datetime, updated_at: false)
  end
end
