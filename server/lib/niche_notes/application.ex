defmodule NicheNotes.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      NicheNotes.Repo,
      {Phoenix.PubSub, name: NicheNotes.PubSub},
      NicheNotesWeb.Endpoint
    ]

    children =
      children ++
        if Application.get_env(:niche_notes, :reminders, true),
          do: [NicheNotes.Reminders],
          else: []

    Supervisor.start_link(children, strategy: :one_for_one, name: NicheNotes.Supervisor)
  end

  @impl true
  def config_change(changed, _new, removed) do
    NicheNotesWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
