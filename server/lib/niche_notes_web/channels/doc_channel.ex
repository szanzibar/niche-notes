defmodule NicheNotesWeb.DocChannel do
  use NicheNotesWeb, :channel

  alias NicheNotes.Docs

  @impl true
  def join("doc:" <> doc_id, params, socket) do
    case Docs.open(doc_id, socket.assigns.current_user_id) do
      :ok ->
        {updates, seq} = Docs.updates_since(doc_id, params["since"] || 0)
        encoded = for {id, update} <- updates, do: [id, Base.encode64(update)]
        {:ok, %{updates: encoded, seq: seq}, assign(socket, :doc_id, doc_id)}

      :forbidden ->
        {:error, %{reason: "forbidden"}}
    end
  end

  @impl true
  def handle_in("update", %{"update" => encoded}, socket) do
    stored = Docs.append_update(socket.assigns.doc_id, Base.decode64!(encoded))
    broadcast_from!(socket, "update", %{seq: stored.id, update: encoded})
    {:reply, {:ok, %{seq: stored.id}}, socket}
  end
end
