import Config

config :niche_notes, NicheNotes.Repo,
  database: Path.expand("../data/dev.db", __DIR__),
  pool_size: 5,
  stacktrace: true,
  show_sensitive_data_on_connection_error: true

config :niche_notes, NicheNotesWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "X4WucKVgzy5H6UY/tYeVuLIaxGSdCMo/dAWrbEr77Iya0zlSgfrXvG9h8Te4VDRK",
  watchers: []

config :logger, :default_formatter, format: "[$level] $message\n"
config :phoenix, :stacktrace_depth, 20
config :phoenix, :plug_init_mode, :runtime
