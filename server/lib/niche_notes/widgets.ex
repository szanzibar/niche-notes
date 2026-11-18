defmodule NicheNotes.Widgets do
  @moduledoc """
  Once a minute, the Android app of everyone on a note that changed redraws its widgets, so they show what was
  written on another device while the app was closed. A minute keeps a stretch of typing to one message per phone.
  """
  use GenServer
  alias NicheNotes.{Docs, Push}

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  # From the newest change, so a restart sends nothing. A change in the minute before it waits for the widgets'
  # own refresh.
  @impl true
  def init(nil) do
    Process.send_after(self(), :pass, :timer.minutes(1))
    {:ok, Docs.changed_since(0) |> elem(1)}
  end

  @impl true
  def handle_info(:pass, seen) do
    Process.send_after(self(), :pass, :timer.minutes(1))
    {:noreply, pass(seen)}
  end

  @doc false
  def pass(seen) do
    {changed, seen} = Docs.changed_since(seen)
    changed |> Enum.flat_map(&Docs.member_ids/1) |> Enum.uniq() |> Push.refresh_widgets()
    seen
  end
end
