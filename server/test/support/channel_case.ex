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
end
