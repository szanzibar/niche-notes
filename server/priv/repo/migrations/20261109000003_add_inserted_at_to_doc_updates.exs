defmodule NicheNotes.Repo.Migrations.AddInsertedAtToDocUpdates do
  use Ecto.Migration

  def change do
    alter table(:doc_updates) do
      add :inserted_at, :utc_datetime
    end
  end
end
