defmodule NicheNotesWeb.NoteChannel do
  use NicheNotesWeb, :channel

  alias NicheNotes.{Notebooks, Notes}

  @impl true
  def join("note:" <> note_id, _params, socket) do
    note = Notes.get_note!(note_id)

    if Notebooks.can_access?(note.notebook_id, socket.assigns.current_user_id) do
      updates = Notes.get_ydoc_updates(note_id)
      updates_b64 = Enum.map(updates, &Base.encode64/1)
      {:ok, %{ydoc_updates: updates_b64}, assign(socket, :note_id, note_id)}
    else
      {:error, %{reason: "forbidden"}}
    end
  end

  # Client sends a Y.js binary update (base64-encoded).
  # We persist it and relay to other connected clients (not back to sender).
  @impl true
  def handle_in("yjs_update", %{"update" => update_b64}, socket) do
    update = Base.decode64!(update_b64)
    Notes.append_ydoc_update(socket.assigns.note_id, update)
    broadcast_from!(socket, "yjs_update", %{"update" => update_b64})
    {:noreply, socket}
  end
end
