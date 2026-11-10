defmodule NicheNotesWeb.DocChannel do
  use NicheNotesWeb, :channel

  alias NicheNotes.Docs

  @impl true
  def join("doc:" <> doc_id, params, socket) do
    case Docs.open(doc_id, socket.assigns.current_user_id) do
      {:ok, owner_id} ->
        {updates, seq} = Docs.updates_since(doc_id, params["since"] || 0)
        encoded = for {id, update} <- updates, do: [id, Base.encode64(update)]
        reply = %{updates: encoded, seq: seq, owner_id: owner_id, compact: Docs.compact?(doc_id)}
        {:ok, reply, assign(socket, :doc_id, doc_id)}

      :forbidden ->
        {:error, %{reason: "forbidden"}}
    end
  end

  # Cursors and names. Relayed, never stored.
  @impl true
  def handle_in("awareness", %{"update" => encoded}, socket) do
    broadcast_from!(socket, "awareness", %{update: encoded})
    {:noreply, socket}
  end

  def handle_in("update", %{"update" => encoded}, socket) do
    stored = Docs.append_update(socket.assigns.doc_id, Base.decode64!(encoded))
    broadcast_from!(socket, "update", %{seq: stored.id, update: encoded})
    {:reply, {:ok, %{seq: stored.id}}, socket}
  end

  def handle_in("snapshot", %{"update" => encoded, "upto" => upto}, socket)
      when is_integer(upto) and upto > 0 do
    {:ok, _} = Docs.snapshot(socket.assigns.doc_id, upto, Base.decode64!(encoded))
    {:reply, :ok, socket}
  end
end
