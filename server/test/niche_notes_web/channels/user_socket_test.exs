defmodule NicheNotesWeb.UserSocketTest do
  use NicheNotesWeb.ChannelCase

  test "the socket needs a valid token" do
    assert :error = connect(NicheNotesWeb.UserSocket, %{"token" => "nope"})
    assert :error = connect(NicheNotesWeb.UserSocket, %{})

    token = NicheNotesWeb.UserSocket.token(NicheNotesWeb.Endpoint, "u1")
    assert {:ok, socket} = connect(NicheNotesWeb.UserSocket, %{"token" => token})
    assert socket.assigns.current_user_id == "u1"
  end
end
