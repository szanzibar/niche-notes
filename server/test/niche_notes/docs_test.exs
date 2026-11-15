defmodule NicheNotes.DocsTest do
  use NicheNotes.DataCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1, edit!: 2]
  alias NicheNotes.Docs

  test "a restore renames the log and says what it holds" do
    me = user!("Me")
    other = user!("Other")

    for title <- ["Groceries", "Packing"] do
      note = Ecto.UUID.generate()
      {:ok, _} = Docs.open(note, me.id)
      edit!(note, &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "title", title))
      {:ok, _} = Docs.share(note, me.id, other.id)
    end

    before = Docs.generation()
    Docs.new_generation()
    assert Docs.generation() != before

    assert ["Me: 2 notes", "Other: 2 notes", "Edited last:", packing, groceries] =
             String.split(Docs.summary(), "\n")

    assert packing =~ ~r/^20\d\d-.*  Packing$/
    assert groceries =~ ~r/  Groceries$/
  end
end
