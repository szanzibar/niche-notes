defmodule NicheNotes.Repo.Migrations.CreateDocs do
  use Ecto.Migration

  def change do
    create table(:docs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :owner_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:docs, [:owner_id])

    create table(:doc_shares, primary_key: false) do
      add :doc_id, references(:docs, type: :binary_id, on_delete: :delete_all), primary_key: true

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:doc_shares, [:user_id])

    # id is the sync sequence number, so it must never be reused.
    create table(:doc_updates, primary_key: false) do
      add :id, :bigserial, primary_key: true
      add :doc_id, references(:docs, type: :binary_id, on_delete: :delete_all), null: false
      add :update, :binary, null: false
    end

    create index(:doc_updates, [:doc_id, :id])
  end
end
