import Config

config :niche_notes, NicheNotesWeb.Endpoint,
  http: [port: String.to_integer(System.get_env("PORT", "4000"))]

if config_env() == :prod do
  host = System.fetch_env!("PHX_HOST")

  config :niche_notes, NicheNotes.Repo,
    database: System.get_env("DATABASE_PATH", "/data/niche_notes.db"),
    pool_size: 5

  config :niche_notes, NicheNotesWeb.Endpoint,
    server: true,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0, 0, 0, 0, 0}],
    secret_key_base: System.fetch_env!("SECRET_KEY_BASE")

  config :niche_notes, :android,
    app_id: System.get_env("ANDROID_APP_ID"),
    cert_sha256: System.get_env("ANDROID_CERT_SHA256")

  config :niche_notes, :oidc,
    client_id: System.fetch_env!("OIDC_CLIENT_ID"),
    client_secret: System.fetch_env!("OIDC_CLIENT_SECRET"),
    base_url: System.fetch_env!("POCKET_ID_URL"),
    redirect_uri: "https://#{host}/auth/callback",
    # Pocket ID only puts name and email in the ID token when asked.
    authorization_params: [scope: "profile email"],
    http_adapter: {Assent.HTTPAdapter.Req, []}

  # A server without a Google client still runs, and only Connect Google Calendar fails.
  config :niche_notes, :google,
    client_id: System.get_env("GOOGLE_CLIENT_ID"),
    client_secret: System.get_env("GOOGLE_CLIENT_SECRET"),
    redirect_uri: "https://#{host}/auth/google/callback"
end
