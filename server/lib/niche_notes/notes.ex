defmodule NicheNotes.Notes do
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Notes.Note

  def list_notes(notebook_id) do
    Repo.all(from n in Note, where: n.notebook_id == ^notebook_id, order_by: [desc: n.updated_at])
  end

  def get_note!(id), do: Repo.get!(Note, id)

  def create_note(attrs) do
    %Note{}
    |> Note.changeset(attrs)
    |> Repo.insert()
  end

  def update_note(note, attrs) do
    note
    |> Note.changeset(attrs)
    |> Repo.update()
  end

  def delete_note(note), do: Repo.delete(note)

  # Called by the Phoenix Channel when a Y.js update arrives.
  # Appends the binary update to the stored list of updates.
  # The server doesn't understand Y.js — it stores updates for replay on join.
  def append_ydoc_update(note_id, update_binary) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    Repo.update_all(
      from(n in Note,
        where: n.id == ^note_id,
        update: [set: [
          ydoc_updates: fragment("array_append(COALESCE(ydoc_updates, ARRAY[]::bytea[]), ?)", ^update_binary),
          updated_at: ^now
        ]]
      ),
      []
    )
  end

  def get_ydoc_updates(note_id) do
    Repo.one(from n in Note, where: n.id == ^note_id, select: n.ydoc_updates) || []
  end
end
