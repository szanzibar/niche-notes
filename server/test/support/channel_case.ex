defmodule NicheNotesWeb.ChannelCase do
  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import NicheNotesWeb.ChannelCase

      @endpoint NicheNotesWeb.Endpoint
    end
  end

  setup tags do
    NicheNotes.DataCase.setup_sandbox(tags)
    :ok
  end

  def user!(name) do
    {:ok, user} = NicheNotes.Accounts.find_or_create_user(%{"sub" => name, "name" => name})
    user
  end

  # Applies the change on top of the note's log and stores it, the way a device would.
  def edit!(note, change) do
    doc = Yex.Doc.new()
    {rows, _} = NicheNotes.Docs.updates_since(note, 0)
    for {_, update} <- rows, do: :ok = Yex.apply_update(doc, update)
    {:ok, before} = Yex.encode_state_vector(doc)
    change.(doc)
    {:ok, update} = Yex.encode_state_as_update(doc, before)
    NicheNotes.Docs.append_update(note, update)
  end
end
