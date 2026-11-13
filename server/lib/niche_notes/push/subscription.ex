defmodule NicheNotes.Push.Subscription do
  use Ecto.Schema

  @primary_key {:endpoint, :string, autogenerate: false}
  @foreign_key_type :binary_id

  schema "push_subscriptions" do
    belongs_to :user, NicheNotes.Accounts.User
    field :p256dh, :string
    field :auth, :string
    field :time_zone, :string
    timestamps(type: :utc_datetime)
  end
end
