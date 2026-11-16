defmodule NicheNotes.GenerationTest do
  use NicheNotes.DataCase

  import ExUnit.CaptureLog
  require Logger
  alias NicheNotes.Generation

  @says "Every device sends its notes again"

  defp open?, do: Repo.query!("select open from generation").rows == [[1]]

  test "a database the app closed keeps its generation, and one it didn't close gets a new one and says so" do
    Logger.put_module_level(Generation, :info)
    on_exit(fn -> Logger.delete_module_level(Generation) end)
    Repo.query!("update generation set open = false")
    name = Generation.id()

    refute capture_log(fn -> start_supervised!(Generation) end) =~ @says
    assert Generation.id() == name
    assert open?()

    stop_supervised!(Generation)
    refute open?()

    # A backup taken while the app ran, or a crash: nothing cleared the mark.
    Repo.query!("update generation set open = true")
    assert capture_log(fn -> start_supervised!(Generation) end) =~ @says
    assert Generation.id() != name
    assert open?()
  end
end
