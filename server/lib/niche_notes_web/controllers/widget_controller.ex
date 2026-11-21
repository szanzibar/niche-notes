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
         {:ok, widget} <- Docs.widget(doc_id, user_id) do
      json(conn, widget)
    else
      :error -> conn |> put_status(:not_found) |> json(%{error: "not found"})
      _ -> conn |> put_status(:unauthorized) |> json(%{error: "unauthorized"})
    end
  end

  # The Android app reads this with its own sign-in, so a Due widget has nothing to pick. The phone says its date,
  # since that decides where ticking a repeating line moves it.
  def due(conn, %{"today" => today}) do
    json(conn, Docs.due_widget(conn.assigns.current_user_id, Date.from_iso8601!(today)))
  end

  # The app's lists get the fold at once.
  def collapse(conn, %{"section" => section, "collapsed" => collapsed})
      when is_boolean(collapsed) do
    user_id = conn.assigns.current_user_id
    {stored, update} = Docs.collapse_due(user_id, section, collapsed)

    NicheNotesWeb.Endpoint.broadcast!("doc:#{user_id}", "update", %{
      seq: stored.id,
      update: Base.encode64(update)
    })

    send_resp(conn, :no_content, "")
  end
end
