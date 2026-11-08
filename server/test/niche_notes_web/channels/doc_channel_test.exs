defmodule NicheNotesWeb.DocChannelTest do
  use NicheNotesWeb.ChannelCase

  alias NicheNotes.Docs

  setup do
    %{me: user!("me"), other: user!("other"), note: Ecto.UUID.generate()}
  end

  test "first join creates the doc for the joiner and refuses everyone else", %{
    me: me,
    other: other,
    note: note
  } do
    assert {:ok, %{updates: [], seq: 0}, _} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
               "doc:#{note}"
             )

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: other.id),
               "doc:#{note}"
             )

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: other.id),
               "doc:#{me.id}"
             )

    assert {:error, %{reason: "forbidden"}} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: other.id),
               "doc:not-a-uuid"
             )
  end

  test "updates are stored, relayed to others, and replayed from since", %{
    me: me,
    other: other,
    note: note
  } do
    {:ok, _, mine} =
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
        "doc:#{note}"
      )

    {:ok, _} = Docs.share(note, me.id, other.id)

    {:ok, _, theirs} =
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: other.id),
        "doc:#{note}"
      )

    ref = push(mine, "update", %{"update" => Base.encode64("one")})
    assert_reply ref, :ok, %{seq: seq1}
    assert_push "update", %{seq: ^seq1, update: _}

    ref = push(theirs, "update", %{"update" => Base.encode64("two")})
    assert_reply ref, :ok, %{seq: seq2}
    assert seq2 > seq1

    two = Base.encode64("two")

    assert {:ok, %{updates: [[^seq2, ^two]], seq: ^seq2}, _} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
               "doc:#{note}",
               %{"since" => seq1}
             )
  end
end
