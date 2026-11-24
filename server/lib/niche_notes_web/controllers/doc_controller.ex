defmodule NicheNotesWeb.DocController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Docs

  def history(conn, %{"id" => doc_id}) do
    if Docs.can_access?(doc_id, conn.assigns.current_user_id) do
      rows = for {seq, at, update} <- Docs.history(doc_id), do: [seq, at, Base.encode64(update)]
      json(conn, %{rows: rows})
    else
      conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end

  def delete(conn, %{"id" => doc_id}) do
    case Docs.purge(doc_id, conn.assigns.current_user_id) do
      :ok -> send_resp(conn, :no_content, "")
      {:error, :forbidden} -> conn |> put_status(:forbidden) |> json(%{error: "forbidden"})
    end
  end
end
