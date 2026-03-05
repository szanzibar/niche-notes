defmodule NicheNotes.Repo.Migrations.ChangeNotesYdocToArray do
  use Ecto.Migration

  def change do
    alter table(:notes) do
      remove :ydoc_state
      add :ydoc_updates, {:array, :binary}, default: []
    end
  end
end
