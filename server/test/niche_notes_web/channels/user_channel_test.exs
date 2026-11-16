defmodule NicheNotesWeb.UserChannelTest do
  use NicheNotesWeb.ChannelCase

  alias NicheNotes.Docs
  alias NicheNotes.Docs.Doc
  alias NicheNotes.Repo

  setup do
    me = user!("me")
    other = user!("other")

    note = fn owner ->
      id = Ecto.UUID.generate()
      {:ok, _} = Docs.open(id, owner.id)
      id
    end

    %{me: me, other: other, note: note}
  end

  defp join_user(user, params) do
    subscribe_and_join(
      socket(NicheNotesWeb.UserSocket, nil, current_user_id: user.id),
      "user:#{user.id}",
      params
    )
  end

  test "the join names the notes that changed after the cursor, and a pull brings their rows", %{
    me: me,
    other: other,
    note: note
  } do
    {:ok, _} = Docs.open(me.id, me.id)
    Docs.append_update(me.id, "tree")
    mine = note.(me)
    shared = note.(other)
    {:ok, _} = Docs.share(shared, other.id, me.id)
    theirs = note.(other)
    one = Docs.append_update(mine, "one")
    two = Docs.append_update(shared, "two")
    Docs.append_update(theirs, "secret")
    seq = two.id

    assert {:ok, %{changed: changed, seq: ^seq}, _} = join_user(me, %{"after" => 0})
    assert Enum.sort(changed) == Enum.sort([mine, shared])
    assert {:ok, %{changed: [], seq: ^seq}, socket} = join_user(me, %{"after" => seq})

    unknown = Ecto.UUID.generate()
    ref = push(socket, "pull", %{"docs" => [[mine, 0], [shared, 0], [theirs, 0], [unknown, 0]]})
    encoded = Base.encode64("two")
    assert_reply ref, :ok, %{docs: pulled}

    assert Enum.sort(pulled) ==
             Enum.sort([
               [mine, me.id, one.id, [[one.id, Base.encode64("one")]]],
               [shared, other.id, two.id, [[two.id, encoded]]]
             ])

    assert Repo.get(Doc, unknown) == nil

    ref = push(socket, "pull", %{"docs" => [[mine, one.id]]})
    assert_reply ref, :ok, %{docs: [[^mine, _, _, []]]}
  end

  test "the join names this copy of the log", %{me: me} do
    assert {:ok, %{generation: generation}, _} = join_user(me, %{})
    assert generation == NicheNotes.Generation.id()
    assert generation =~ ~r/^[0-9a-f]{32}$/
  end

  test "someone else's user channel refuses the join", %{me: me, other: other} do
    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: other.id),
               "user:#{me.id}",
               %{}
             )
  end

  test "a stored row tells each member's devices that the note changed", %{
    me: me,
    other: other,
    note: note
  } do
    stranger = user!("stranger")
    shared = note.(me)
    {:ok, _} = Docs.share(shared, me.id, other.id)
    for user <- [me, other, stranger], do: NicheNotesWeb.Endpoint.subscribe("user:#{user.id}")

    Docs.append_update(shared, "edit")

    for user <- [me, other] do
      topic = "user:#{user.id}"

      assert_receive %Phoenix.Socket.Broadcast{
        topic: ^topic,
        event: "changed",
        payload: %{doc: ^shared}
      }
    end

    stranger_topic = "user:#{stranger.id}"
    refute_receive %Phoenix.Socket.Broadcast{topic: ^stranger_topic}
  end
end
