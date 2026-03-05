defmodule NicheNotesWeb.UserSocket do
  use Phoenix.Socket

  channel "note:*", NicheNotesWeb.NoteChannel
  channel "notebook:*", NicheNotesWeb.NotebookChannel

  # Authenticate via session cookie (same-origin WebSocket upgrade sends cookies automatically)
  @impl true
  def connect(_params, socket, %{session: %{"user_id" => user_id}}) do
    {:ok, assign(socket, :current_user_id, user_id)}
  end

  def connect(_params, _socket, _connect_info) do
    :error
  end

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.current_user_id}"
end
