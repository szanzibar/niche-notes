defmodule NicheNotesWeb.AlertChannel do
  use NicheNotesWeb, :channel

  # A desktop app joins with its time zone and gets its person's alerts for as long as it stays.
  @impl true
  def join(
        "alerts:" <> user_id,
        %{"time_zone" => time_zone},
        %{assigns: %{current_user_id: user_id}} = socket
      ) do
    case NicheNotes.Push.listen(user_id, time_zone) do
      :ok -> {:ok, socket}
      {:error, _} -> {:error, %{reason: "time zone"}}
    end
  end

  def join(_topic, _params, _socket), do: {:error, %{reason: "forbidden"}}

  @impl true
  def handle_info({:alert, message}, socket) do
    push(socket, "alert", message)
    {:noreply, socket}
  end
end
