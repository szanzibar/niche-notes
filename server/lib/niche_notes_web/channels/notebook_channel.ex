defmodule NicheNotesWeb.NotebookChannel do
  use NicheNotesWeb, :channel

  alias NicheNotes.Notebooks

  @impl true
  def join("notebook:" <> notebook_id, _params, socket) do
    if Notebooks.can_access?(notebook_id, socket.assigns.current_user_id) do
      {:ok, assign(socket, :notebook_id, notebook_id)}
    else
      {:error, %{reason: "forbidden"}}
    end
  end

  # Task mutations are broadcast here from TaskController via Endpoint.broadcast/3.
  # No handle_in needed — clients receive updates passively.
end
