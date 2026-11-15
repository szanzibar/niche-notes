defmodule NicheNotes.Repo.Migrations.CreateGeneration do
  use Ecto.Migration

  # One row that names this copy of the update log. A restore gives it a new id.
  def up do
    create table(:generation, primary_key: false) do
      add :id, :text, null: false
    end

    execute "insert into generation (id) values (lower(hex(randomblob(16))))"
  end

  def down do
    drop table(:generation)
  end
end
