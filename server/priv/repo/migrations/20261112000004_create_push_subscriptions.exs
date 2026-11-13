defmodule NicheNotes.Repo.Migrations.CreatePushSubscriptions do
  use Ecto.Migration

  # One row per device that allowed alerts. The push service's endpoint names the device.
  def change do
    create table(:push_subscriptions, primary_key: false) do
      add :endpoint, :string, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :p256dh, :string, null: false
      add :auth, :string, null: false
      add :time_zone, :string, null: false
      timestamps(type: :utc_datetime)
    end

    create index(:push_subscriptions, [:user_id])
  end
end
