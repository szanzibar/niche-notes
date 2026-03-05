# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :niche_notes,
  ecto_repos: [NicheNotes.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

# Configure the endpoint
config :niche_notes, NicheNotesWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: NicheNotesWeb.ErrorHTML, json: NicheNotesWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: NicheNotes.PubSub

# OIDC via Pocket ID (values come from runtime config in prod, env vars in dev)
config :niche_notes, :oidc,
  client_id: System.get_env("OIDC_CLIENT_ID", "niche-notes"),
  client_secret: System.get_env("OIDC_CLIENT_SECRET", ""),
  base_url: System.get_env("POCKET_ID_URL", "http://localhost:8080"),
  redirect_uri: System.get_env("OIDC_REDIRECT_URI", "http://localhost:4000/auth/callback"),
  http_adapter: {Assent.HTTPAdapter.Req, []}

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
