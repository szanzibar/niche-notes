defmodule NicheNotesWeb.UserChannel do
  use NicheNotesWeb, :channel

  alias NicheNotes.Docs

  # The reply names the notes that changed since the device's last catch-up, which it then pulls.
  @impl true
  def join("user:" <> user_id, params, %{assigns: %{current_user_id: user_id}} = socket) do
    {changed, seq} = Docs.changed_for(user_id, params["after"] || 0)
    {:ok, %{changed: changed, seq: seq, generation: NicheNotes.Generation.id()}, socket}
  end

  def join(_topic, _params, _socket), do: {:error, %{reason: "forbidden"}}

  # Notes the device keeps without having them open, each from its own `since`. One it can't open is left out.
  @impl true
  def handle_in("pull", %{"docs" => docs}, socket) do
    owners = Docs.owners(Enum.map(docs, &hd/1), socket.assigns.current_user_id)

    pulled =
      for [id, since] <- docs, Map.has_key?(owners, id) do
        {updates, seq} = Docs.updates_since(id, since)
        [id, owners[id], seq, for({row, update} <- updates, do: [row, Base.encode64(update)])]
      end

    {:reply, {:ok, %{docs: pulled}}, socket}
  end
end
