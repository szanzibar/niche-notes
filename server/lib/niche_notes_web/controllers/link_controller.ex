defmodule NicheNotesWeb.LinkController do
  use NicheNotesWeb, :controller

  alias NicheNotes.{Accounts, Docs}

  def show(conn, %{"doc_id" => doc_id}) do
    case Docs.link(doc_id, conn.assigns.current_user_id) do
      {:ok, link} -> json(conn, %{link: link})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def create(conn, %{"doc_id" => doc_id}) do
    case Docs.create_link(doc_id, conn.assigns.current_user_id) do
      {:ok, link} -> json(conn, %{link: link})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def delete(conn, %{"doc_id" => doc_id}) do
    me = conn.assigns.current_user_id

    case Docs.delete_link(doc_id, me) do
      {:ok, guests} ->
        shares_changed([me | guests])
        send_resp(conn, :no_content, "")

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  # Someone without a session becomes a guest, signed in like anyone else, so the whole app works for them.
  def open(conn, %{"link" => link}) do
    case Docs.by_link(link) do
      nil ->
        conn |> put_status(:not_found) |> text("This link has been turned off.")

      doc ->
        user_id = get_session(conn, :user_id) || guest_id()
        :ok = Docs.join(doc, user_id)
        shares_changed([doc.owner_id, user_id])
        conn |> put_session(:user_id, user_id) |> redirect(to: "/n/#{doc.id}")
    end
  end

  defp guest_id do
    {:ok, guest} = Accounts.create_guest()
    guest.id
  end

  defp shares_changed(user_ids) do
    for id <- user_ids, do: NicheNotesWeb.Endpoint.broadcast("user:#{id}", "shares_changed", %{})
  end
end
