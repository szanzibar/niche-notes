defmodule NicheNotesWeb.DocChannel do
  use NicheNotesWeb, :channel

  require Logger
  alias NicheNotes.{Docs, Push}

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

        # Known and accepted: someone shared by name while the note is open sends their edits once it rejoins.
        read_only = not Docs.can_edit?(doc_id, socket.assigns.current_user_id)
        {:ok, reply, assign(socket, doc_id: doc_id, read_only: read_only)}

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

  # Someone who can only read sees edits and cursors, and makes none.
  def handle_in("update", _payload, %{assigns: %{read_only: true}} = socket),
    do: {:reply, {:error, %{reason: "read_only"}}, socket}

  def handle_in("update", %{"update" => encoded}, socket) do
    update = Base.decode64!(encoded)

    # Stored once, since merging a log that holds its updates many times over crashes the Y.js library.
    if seq = Docs.held_seq(socket.assigns.doc_id, update) do
      {:reply, {:ok, %{seq: seq}}, socket}
    else
      unseen = Docs.unseen_places(socket.assigns.doc_id, update)
      stored = Docs.append_update(socket.assigns.doc_id, update)
      broadcast_from!(socket, "update", %{seq: stored.id, update: encoded})
      if unseen != [], do: warn(socket.assigns.current_user_id, unseen)
      {:reply, {:ok, %{seq: stored.id}}, socket}
    end
  end

  # An app loaded before the server folded its own log still sends its snapshot, and waits for this reply.
  def handle_in("snapshot", _payload, socket), do: {:reply, :ok, socket}

  # A device wrote places from a tree that was behind, which the app should never do. Its person hears which notes
  # to look at, on every device with alerts on, and the log names them.
  defp warn(user_id, notes) do
    Logger.warning(
      "tree #{user_id}: a device placed #{Enum.join(notes, ", ")} without having seen their place"
    )

    message = %{
      title: "Notes may have moved by themselves",
      body: notes |> Enum.map_join(", ", &Docs.title/1) |> String.slice(0, 200),
      note: hd(notes),
      tag: "moved #{hd(notes)}"
    }

    for subscription <- Push.subscriptions([user_id]), do: Push.send(subscription, message)
  end
end
