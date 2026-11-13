defmodule NicheNotesWeb.PushController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Push

  def key(conn, _params), do: json(conn, %{key: Push.public_key()})

  def subscribe(conn, %{"subscription" => subscription, "time_zone" => time_zone}) do
    case Push.subscribe(conn.assigns.current_user_id, subscription, time_zone) do
      {:ok, _} ->
        send_resp(conn, :no_content, "")

      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "bad subscription"})
    end
  end
end
