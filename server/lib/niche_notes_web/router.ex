defmodule NicheNotesWeb.Router do
  use NicheNotesWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug :own_pages
    plug NicheNotesWeb.Plugs.RequireAuth
  end

  scope "/auth", NicheNotesWeb do
    pipe_through :browser

    if Mix.env() == :prod do
      get "/login", AuthController, :login
    else
      get "/login", DevAuthController, :login
    end

    get "/callback", AuthController, :callback
    delete "/logout", AuthController, :logout
    get "/google", GoogleCalendarController, :connect
    get "/google/callback", GoogleCalendarController, :callback
  end

  scope "/api", NicheNotesWeb do
    pipe_through :api

    get "/me", MeController, :show
    get "/users", UserController, :index
    get "/shares", ShareController, :index
    delete "/docs/:id", DocController, :delete
    post "/docs/:doc_id/shares", ShareController, :create
    delete "/docs/:doc_id/shares/:user_id", ShareController, :delete
    get "/docs/:doc_id/widget_token", WidgetController, :token
    get "/docs/:doc_id/link", LinkController, :show
    put "/docs/:doc_id/link", LinkController, :create
    delete "/docs/:doc_id/link", LinkController, :delete
    get "/push_key", PushController, :key
    put "/push_subscriptions", PushController, :subscribe
    get "/google_calendar", GoogleCalendarController, :show
    delete "/google_calendar", GoogleCalendarController, :delete
    patch "/docs/:doc_id/line", LineController, :update
  end

  scope "/.well-known", NicheNotesWeb do
    get "/assetlinks.json", AssetLinksController, :show
  end

  # A widget has no session. Its token says which note it reads, and a Due widget has the user's tree's.
  scope "/api", NicheNotesWeb do
    get "/widget", WidgetController, :show
    get "/widget/due", WidgetController, :due
  end

  scope "/", NicheNotesWeb do
    pipe_through :browser

    get "/s/:link", LinkController, :open
    get "/*path", SPAController, :index
  end

  # Another site under our domain is same-site to the session cookie, so the API answers only our own pages.
  # A request that names no site comes from no page. Browsers from before 2023 name none either, known and accepted.
  defp own_pages(conn, _opts) do
    if get_req_header(conn, "sec-fetch-site") in [[], ["same-origin"], ["none"]],
      do: conn,
      else: conn |> send_resp(:forbidden, "") |> halt()
  end
end
