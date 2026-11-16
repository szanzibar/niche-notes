defmodule NicheNotes.Repo.Migrations.AddOpenToGeneration do
  use Ecto.Migration

  # Set while the app runs. A database from before the mark may be a backup, so it starts out set.
  def change do
    alter table(:generation) do
      add :open, :boolean, null: false, default: true
    end
  end
end
