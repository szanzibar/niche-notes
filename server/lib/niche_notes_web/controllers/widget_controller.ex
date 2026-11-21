defmodule NicheNotesWeb.WidgetController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Docs

  @salt "widget"

  # The picker hands this to the widget, which has no session of its own. It never expires, and
  # reads only while the user can still open the note.
  def token(conn, %{"doc_id" => doc_id}) do
    user_id = conn.assigns.current_user_id

    if Docs.can_access?(doc_id, user_id) do
      json(conn, %{token: Phoenix.Token.sign(conn, @salt, {user_id, doc_id})})
    else
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def show(conn, _params) do
    with {:ok, {user_id, doc_id}} <- verify(conn),
         {:ok, widget} <- Docs.widget(doc_id, user_id) do
      json(conn, widget)
    else
      :error -> conn |> put_status(:not_found) |> json(%{error: "not found"})
      _ -> conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"})
    end
  end

  # The phone says its date, since that decides where ticking a repeating line moves it.
  def due(conn, %{"today" => today}) do
    with {:ok, {user_id, user_id}} <- verify(conn),
         {:ok, today} <- Date.from_iso8601(today) do
      json(conn, Docs.due_widget(user_id, today))
    else
      _ -> conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"})
    end
  end

  defp verify(conn) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         do: Phoenix.Token.verify(conn, @salt, token, max_age: :infinity)
  end
end
