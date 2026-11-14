defmodule NicheNotes.Repo.Migrations.AddLinkToDocs do
  use Ecto.Migration

  def change do
    alter table(:docs) do
      add :link, :text
    end

    create unique_index(:docs, [:link])
  end
end
