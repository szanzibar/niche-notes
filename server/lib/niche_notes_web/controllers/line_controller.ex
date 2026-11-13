defmodule NicheNotesWeb.LineController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Docs

  @due ~r/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/

  # An alert's buttons: Done ticks the line, or moves a repeating one to the date the device worked out, and
  # Snooze moves it. Apps that have the note open get the change at once.
  def update(conn, %{"doc_id" => doc_id, "due" => due, "text" => text} = params) do
    with [_ | _] = changes <- changes(params),
         {:ok, stored, update} <-
           Docs.change_line(doc_id, conn.assigns.current_user_id, due, text, changes) do
      NicheNotesWeb.Endpoint.broadcast!("doc:#{doc_id}", "update", %{
        seq: stored.id,
        update: Base.encode64(update)
      })

      send_resp(conn, :no_content, "")
    else
      _ -> conn |> put_status(:not_found) |> json(%{error: "no such line"})
    end
  end

  defp changes(%{"checked" => true}), do: [{"checked", true}]

  defp changes(%{"move_to" => to}) when is_binary(to),
    do: if(to =~ @due, do: [{"due", to}], else: [])

  defp changes(_params), do: []
end
