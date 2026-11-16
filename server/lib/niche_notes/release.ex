defmodule NicheNotes.Release do
  @moduledoc "Runs migrations from the release, before the app starts."
  @app :niche_notes

  def migrate do
    Application.ensure_all_started(:ssl)
    Application.load(@app)

    for repo <- Application.fetch_env!(@app, :ecto_repos) do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end
end
