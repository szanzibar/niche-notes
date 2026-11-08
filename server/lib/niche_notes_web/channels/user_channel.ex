defmodule NicheNotesWeb.UserChannel do
  use NicheNotesWeb, :channel

  @impl true
  def join("user:" <> user_id, _params, %{assigns: %{current_user_id: user_id}} = socket) do
    {:ok, socket}
  end

  def join(_topic, _params, _socket), do: {:error, %{reason: "forbidden"}}
end
