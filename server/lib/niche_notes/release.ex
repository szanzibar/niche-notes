defmodule NicheNotes.Release do
  @moduledoc "What the release runs while the app is stopped: migrations, and the steps after a restore."
  @app :niche_notes

  def migrate do
    Application.ensure_all_started(:ssl)
    Application.load(@app)

    for repo <- Application.fetch_env!(@app, :ecto_repos) do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  # After a backup took the database's place. Devices that see the new generation send what the backup lacks.
  def restored do
    migrate()

    {:ok, _, _} =
      Ecto.Migrator.with_repo(NicheNotes.Repo, fn _repo ->
        NicheNotes.Docs.new_generation()
        IO.puts(NicheNotes.Docs.summary())
      end)
  end
end
