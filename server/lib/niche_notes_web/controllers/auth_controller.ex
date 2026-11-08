defmodule NicheNotesWeb.AuthController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  def login(conn, _params) do
    {:ok, %{url: url, session_params: session_params}} =
      Assent.Strategy.OIDC.authorize_url(oidc_config())

    conn
    |> put_session(:oidc_session_params, session_params)
    |> redirect(external: url)
  end

  def callback(conn, params) do
    config = Keyword.put(oidc_config(), :session_params, get_session(conn, :oidc_session_params))

    with {:ok, %{user: claims}} <- Assent.Strategy.OIDC.callback(config, params),
         {:ok, user} <- Accounts.find_or_create_user(claims) do
      conn
      |> delete_session(:oidc_session_params)
      |> put_session(:user_id, user.id)
      |> redirect(to: "/")
    else
      {:error, reason} ->
        conn |> put_status(:bad_request) |> json(%{error: inspect(reason)})
    end
  end

  def logout(conn, _params) do
    conn |> clear_session() |> send_resp(:no_content, "")
  end

  defp oidc_config, do: Application.fetch_env!(:niche_notes, :oidc)
end
