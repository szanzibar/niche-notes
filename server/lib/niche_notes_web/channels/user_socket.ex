defmodule NicheNotesWeb.UserSocket do
  # A device joins one channel per note, about 3 KB each on the server.
  use Phoenix.Socket, max_channels_per_transport: 10_000

  channel "doc:*", NicheNotesWeb.DocChannel
  channel "user:*", NicheNotesWeb.UserChannel

  @salt "user socket"
  @month 60 * 60 * 24 * 30

  # /api/me hands this to the client, which passes it as the `token` connect param.
  def token(conn_or_endpoint, user_id), do: Phoenix.Token.sign(conn_or_endpoint, @salt, user_id)

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) do
    case Phoenix.Token.verify(socket, @salt, token, max_age: @month) do
      {:ok, user_id} -> {:ok, assign(socket, :current_user_id, user_id)}
      {:error, _} -> :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket), do: "user_socket:#{socket.assigns.current_user_id}"
end
