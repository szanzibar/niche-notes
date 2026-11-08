defmodule NicheNotes.Docs.DocUpdate do
  use Ecto.Schema

  @foreign_key_type :binary_id

  schema "doc_updates" do
    belongs_to :doc, NicheNotes.Docs.Doc
    field :update, :binary
  end
end
