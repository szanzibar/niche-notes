defmodule NicheNotes.GoogleCalendar.Connection do
  use Ecto.Schema

  @primary_key {:user_id, :binary_id, autogenerate: false}

  schema "google_calendars" do
    field :calendar_id, :string
    field :email, :string
    # Encrypted with the app's secret, since database backups leave the server.
    field :refresh_token, :string
    field :time_zone, :string
    timestamps(type: :utc_datetime)
  end
end
