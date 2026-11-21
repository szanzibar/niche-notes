defmodule NicheNotes.Docs.DocLink do
  use Ecto.Schema

  @primary_key {:token, :string, autogenerate: false}
  @foreign_key_type :binary_id

  # Anyone who opens /s/<token> gets the note, to read only or to edit.
  schema "doc_links" do
    belongs_to :doc, NicheNotes.Docs.Doc
    field :read_only, :boolean
    timestamps(type: :utc_datetime, updated_at: false)
  end
end
