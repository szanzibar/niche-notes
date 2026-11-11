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
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, {user_id, doc_id}} <- Phoenix.Token.verify(conn, @salt, token, max_age: :infinity),
         {:ok, note} <- Docs.read_note(doc_id, user_id) do
      json(conn, note)
    else
      :error -> conn |> put_status(:not_found) |> json(%{error: "not found"})
      _ -> conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"})
    end
  end
end
