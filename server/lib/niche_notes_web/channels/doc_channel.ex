defmodule NicheNotesWeb.DocChannel do
  use NicheNotesWeb, :channel

  alias NicheNotes.Docs

  intercept ["close"]

  # A channel checks access only when it joins, so taking a note away from someone ends their open channels on it.
  def close(doc_id, user_ids),
    do: NicheNotesWeb.Endpoint.broadcast("doc:#{doc_id}", "close", %{user_ids: user_ids})

  @impl true
  def handle_out("close", %{user_ids: user_ids}, socket) do
    if socket.assigns.current_user_id in user_ids,
      do: {:stop, :shutdown, socket},
      else: {:noreply, socket}
  end

  @impl true
  def join("doc:" <> doc_id, params, socket) do
    case Docs.open(doc_id, socket.assigns.current_user_id) do
      {:ok, owner_id} ->
        {updates, seq} = Docs.updates_since(doc_id, params["since"] || 0)
        encoded = for {id, update} <- updates, do: [id, Base.encode64(update)]
        reply = %{updates: encoded, seq: seq, owner_id: owner_id}
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

  # An app loaded before the server folded its own log still sends its snapshot, and waits for this reply.
  def handle_in("snapshot", _payload, socket), do: {:reply, :ok, socket}
end
