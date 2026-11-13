import Config

config :niche_notes, NicheNotes.Repo,
  database: Path.expand("../data/test.db", __DIR__),
  pool_size: 5,
  pool: Ecto.Adapters.SQL.Sandbox

config :niche_notes, NicheNotesWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "A2SuA/y5N+4EZ4iYidbjr/FZjol7DtgOPIkM3wmv8S94mJeXQl8XESMjD/I2JvcF",
  server: false

config :logger, level: :warning
config :phoenix, :plug_init_mode, :runtime

config :niche_notes, :android, app_id: "app.nichenotes.test", cert_sha256: "AA:BB"

# Tests run each reminders pass and calendar sync themselves, and catch pushes and Google's requests before
# they leave.
config :niche_notes, :reminders, false
config :niche_notes, :push_req, plug: {Req.Test, NicheNotes.Push}

config :niche_notes, :google,
  client_id: "client",
  client_secret: "secret",
  http_adapter: {Assent.HTTPAdapter.Req, plug: {Req.Test, NicheNotes.GoogleCalendar}}

config :niche_notes, :google_req, plug: {Req.Test, NicheNotes.GoogleCalendar}, retry: false
