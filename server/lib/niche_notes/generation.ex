defmodule NicheNotes.Generation do
  @moduledoc """
  The name of this copy of the update log. Each device remembers it, and one that meets another name sends its
  notes again, because the log it knew is gone.

  The app marks its database open while it runs and clears the mark when it stops. A database still marked at
  start is a backup taken while the app ran, or what a crash left, and the app can't tell which. A backup lacks
  edits that devices hold, so it gets a new name. Restoring one is then putting the file in place and starting
  the app.

  Known and accepted: a copy made while the app is stopped carries no mark, so it restores under the old name.
  """
  use GenServer
  import Ecto.Query
  require Logger
  alias NicheNotes.{Docs, Repo}

  def id, do: Repo.one!(from g in "generation", select: g.id)

  def start_link(_), do: GenServer.start_link(__MODULE__, nil)

  @impl true
  def init(nil) do
    # Without this the supervisor's shutdown never reaches `terminate/2`.
    Process.flag(:trap_exit, true)

    renamed =
      Repo.query!("update generation set id = lower(hex(randomblob(16))) where open returning id")

    if renamed.num_rows == 1 do
      Logger.info(
        "The app did not close this database, so it is a restored backup or what a crash left. " <>
          "Every device sends its notes again. It holds:\n" <> Docs.summary()
      )
    end

    Repo.query!("update generation set open = true")
    {:ok, nil}
  end

  @impl true
  def terminate(_reason, nil), do: Repo.query!("update generation set open = false")
end
