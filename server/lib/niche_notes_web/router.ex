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
    get "/push_key", PushController, :key
    put "/push_subscriptions", PushController, :subscribe
    get "/google_calendar", GoogleCalendarController, :show
    delete "/google_calendar", GoogleCalendarController, :delete
    patch "/docs/:doc_id/line", LineController, :update
  end

  scope "/.well-known", NicheNotesWeb do
    get "/assetlinks.json", AssetLinksController, :show
  end

  # A widget has no session. Its token says which note it reads.
  scope "/api", NicheNotesWeb do
    get "/widget", WidgetController, :show
  end

  scope "/", NicheNotesWeb do
    pipe_through :browser

    get "/*path", SPAController, :index
  end
end
