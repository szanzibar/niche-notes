import Config

# Passkeys, the service worker and crypto.randomUUID all need https, so we assume a TLS proxy in front.
config :niche_notes, NicheNotesWeb.Endpoint,
  force_ssl: [rewrite_on: [:x_forwarded_proto]],
  exclude: [hosts: ["localhost", "127.0.0.1"]]

config :logger, level: :info
