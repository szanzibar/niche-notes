defmodule NicheNotes.Repo.Migrations.CreateNotebooks do
  use Ecto.Migration

  def change do
    create table(:notebooks, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :title, :text, null: false
      add :type, :text, null: false
      add :owner_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:notebooks, [:owner_id])

    create table(:notebook_members, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :notebook_id, references(:notebooks, type: :binary_id, on_delete: :delete_all), null: false
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :role, :text, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:notebook_members, [:notebook_id])
    create index(:notebook_members, [:user_id])
    create unique_index(:notebook_members, [:notebook_id, :user_id])
  end
end
