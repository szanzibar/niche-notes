defmodule NicheNotesWeb.ShareController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Docs

  def index(conn, _params) do
    json(conn, %{shares: Docs.list_shares(conn.assigns.current_user_id)})
  end

  def create(conn, %{"doc_id" => doc_id, "user_id" => user_id}) do
    me = conn.assigns.current_user_id

    case Docs.share(doc_id, me, user_id) do
      {:ok, _share} ->
        shares_changed([me, user_id])
        send_resp(conn, :created, "")

      {:error, :not_found} ->
        conn |> put_status(:not_found) |> json(%{error: "no such user"})

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def delete(conn, %{"doc_id" => doc_id, "user_id" => user_id}) do
    me = conn.assigns.current_user_id

    case Docs.unshare(doc_id, me, user_id) do
      :ok ->
        shares_changed([me, user_id])
        send_resp(conn, :no_content, "")

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  defp shares_changed(user_ids) do
    for id <- user_ids, do: NicheNotesWeb.Endpoint.broadcast("user:#{id}", "shares_changed", %{})
  end
end
