import Config

config :niche_notes,
  ecto_repos: [NicheNotes.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

config :niche_notes, NicheNotesWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [formats: [json: NicheNotesWeb.ErrorJSON], layout: false],
  pubsub_server: NicheNotes.PubSub

# Dev and test sign in through DevAuthController, so these only need to exist. Prod sets them in runtime.exs.
config :niche_notes, :oidc,
  client_id: "niche-notes",
  client_secret: "",
  base_url: "http://localhost:8080",
  redirect_uri: "http://localhost:4000/auth/callback",
  http_adapter: {Assent.HTTPAdapter.Req, []}

config :niche_notes, :google,
  redirect_uri: "http://localhost:4000/auth/google/callback",
  http_adapter: {Assent.HTTPAdapter.Req, []}

config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

# Alerts come due at a wall-clock time in each device's time zone.
config :elixir, :time_zone_database, Tz.TimeZoneDatabase

import_config "#{config_env()}.exs"
