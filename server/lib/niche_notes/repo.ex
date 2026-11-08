defmodule NicheNotes.Repo do
  use Ecto.Repo,
    otp_app: :niche_notes,
    adapter: Ecto.Adapters.SQLite3
end
