defmodule NicheNotesWeb.AuthController do
  use NicheNotesWeb, :controller

  alias NicheNotes.Accounts

  plug NicheNotesWeb.Plugs.HandOff,
       [state: ["oidc_session_params", :state], app_cookie: true] when action == :callback

  def login(conn, _params) do
    # Pocket ID signs the same person straight back in while its own session lasts, so after Sign out it asks.
    config =
      if get_session(conn, :signed_out),
        do: put_in(oidc_config(), [:authorization_params, :prompt], "select_account"),
        else: oidc_config()

    {:ok, %{url: url, session_params: session_params}} =
      Assent.Strategy.OIDC.authorize_url(config)

    conn
    |> put_session(:oidc_session_params, session_params)
    |> redirect(external: url)
  end

  def callback(conn, params) do
    config = Keyword.put(oidc_config(), :session_params, get_session(conn, :oidc_session_params))

    with {:ok, %{user: claims}} <- Assent.Strategy.OIDC.callback(config, params),
         {:ok, user} <- Accounts.find_or_create_user(claims) do
      conn
      |> clear_session()
      |> put_session(:user_id, user.id)
      |> redirect(to: "/")
    else
      {:error, reason} ->
        conn |> put_status(:bad_request) |> json(%{error: inspect(reason)})
    end
  end

  def logout(conn, _params) do
    conn |> clear_session() |> put_session(:signed_out, true) |> send_resp(:no_content, "")
  end

  defp oidc_config, do: Application.fetch_env!(:niche_notes, :oidc)
end
