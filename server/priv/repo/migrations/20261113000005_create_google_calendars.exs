defmodule NicheNotes.Repo.Migrations.CreateGoogleCalendars do
  use Ecto.Migration

  # One Niche Notes calendar per person who connected Google Calendar.
  def change do
    create table(:google_calendars, primary_key: false) do
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :calendar_id, :string, null: false
      add :email, :string, null: false
      add :refresh_token, :text, null: false
      add :time_zone, :string, null: false
      timestamps(type: :utc_datetime)
    end
  end
end
