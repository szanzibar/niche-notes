defmodule NicheNotesWeb.Router do
  use NicheNotesWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
    plug NicheNotesWeb.Plugs.RequireAuth
  end

  # Auth routes (no auth required)
  scope "/auth", NicheNotesWeb do
    pipe_through :browser

    # In dev, /auth/login bypasses OIDC so the app works without Pocket ID.
    # The client redirects here on 401, so this makes the dev loop seamless.
    if Mix.env() == :dev do
      get "/login", DevAuthController, :login
    else
      get "/login", AuthController, :login
    end

    get "/callback", AuthController, :callback
    delete "/logout", AuthController, :logout
  end

  # JSON API
  scope "/api", NicheNotesWeb do
    pipe_through :api

    get "/me", MeController, :show

    resources "/notebooks", NotebookController, except: [:new, :edit]
    get "/notebooks/:id/members", NotebookController, :members
    post "/notebooks/:id/members", NotebookController, :add_member
    delete "/notebooks/:id/members/:user_id", NotebookController, :remove_member

    resources "/notebooks/:notebook_id/notes", NoteController, except: [:new, :edit]
    resources "/notebooks/:notebook_id/tasks", TaskController, except: [:new, :edit]
  end

  # Serve the React SPA for all other routes
  scope "/", NicheNotesWeb do
    pipe_through :browser

    get "/*path", SPAController, :index
  end
end
