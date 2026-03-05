defmodule NicheNotesWeb.Plugs.RequireAuth do
  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  def init(opts), do: opts

  def call(conn, _opts) do
    case get_session(conn, :user_id) do
      nil ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "not authenticated"})
        |> halt()

      user_id ->
        assign(conn, :current_user_id, user_id)
    end
  end
end
