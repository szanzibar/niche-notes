defmodule NicheNotesWeb.DocController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Docs

  def delete(conn, %{"id" => doc_id}) do
    case Docs.purge(doc_id, conn.assigns.current_user_id) do
      :ok -> send_resp(conn, :no_content, "")
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end
end
