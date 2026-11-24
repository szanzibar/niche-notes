defmodule NicheNotesWeb.LinkController do
  use NicheNotesWeb, :controller

  alias NicheNotes.{Accounts, Docs}

  def index(conn, %{"doc_id" => doc_id}) do
    case Docs.links(doc_id, conn.assigns.current_user_id) do
      {:ok, links} -> json(conn, %{links: links})
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def create(conn, %{"doc_id" => doc_id, "token" => token, "read_only" => read_only})
      when is_binary(token) and is_boolean(read_only) do
    case Docs.create_link(doc_id, conn.assigns.current_user_id, token, read_only) do
      :ok -> send_resp(conn, :no_content, "")
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def delete(conn, %{"doc_id" => doc_id, "token" => token}) do
    me = conn.assigns.current_user_id

    case Docs.delete_link(doc_id, me, token) do
      {:ok, guests} ->
        NicheNotesWeb.DocChannel.close(doc_id, guests)
        shares_changed([me | guests])
        send_resp(conn, :no_content, "")

      {:error, :forbidden} ->
        conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  # Someone without a session becomes a guest, signed in like anyone else, so live edits, cursors and offline work
  # for them.
  def open(conn, %{"link" => token}) do
    case Docs.by_link(token) do
      nil ->
        conn |> put_status(:not_found) |> text("This link has been turned off.")

      link ->
        user_id = get_session(conn, :user_id) || guest_id()
        :ok = Docs.join(link, user_id)
        shares_changed([link.doc.owner_id, user_id])

        # `#link` keeps the note in this browser, since the desktop app here may have no access to it.
        conn |> put_session(:user_id, user_id) |> redirect(to: "/n/#{link.doc_id}#link")
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
