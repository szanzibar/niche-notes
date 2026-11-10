defmodule NicheNotesWeb.DocChannelTest do
  use NicheNotesWeb.ChannelCase

  import Ecto.Query

  alias NicheNotes.Docs
  alias NicheNotes.Docs.DocUpdate
  alias NicheNotes.Repo

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

    ref = push(theirs, "awareness", %{"update" => "cursor"})
    assert_push "awareness", %{update: "cursor"}
    refute_reply ref, :ok

    two = Base.encode64("two")

    assert {:ok, %{updates: [[^seq2, ^two]], seq: ^seq2}, _} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
               "doc:#{note}",
               %{"since" => seq1}
             )
  end

  test "a snapshot stands in for every update up to its seq", %{me: me, note: note} do
    {:ok, _, mine} =
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
        "doc:#{note}"
      )

    ref = push(mine, "update", %{"update" => Base.encode64("one")})
    assert_reply ref, :ok, %{seq: seq1}
    ref = push(mine, "update", %{"update" => Base.encode64("two")})
    assert_reply ref, :ok, %{seq: seq2}

    both = Base.encode64("both")
    ref = push(mine, "snapshot", %{"update" => both, "upto" => seq2})
    assert_reply ref, :ok

    assert {:ok, %{updates: [[^seq2, ^both]], seq: ^seq2}, _} =
             subscribe_and_join(
               socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
               "doc:#{note}",
               %{"since" => seq1}
             )

    ref = push(mine, "update", %{"update" => Base.encode64("three")})
    assert_reply ref, :ok, %{seq: seq3}
    assert seq3 > seq2
  end

  test "the join reply asks for compaction after many rows or a day of quiet", %{
    me: me,
    note: note
  } do
    join = fn ->
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
        "doc:#{note}"
      )
    end

    {:ok, %{compact: false}, mine} = join.()

    for i <- 1..51 do
      ref = push(mine, "update", %{"update" => Base.encode64("#{i}")})
      assert_reply ref, :ok, %{seq: _}
    end

    assert {:ok, %{compact: true, seq: seq}, _} = join.()

    ref = push(mine, "snapshot", %{"update" => Base.encode64("all"), "upto" => seq})
    assert_reply ref, :ok
    assert {:ok, %{compact: false}, _} = join.()

    ref = push(mine, "update", %{"update" => Base.encode64("more")})
    assert_reply ref, :ok, %{seq: _}
    assert {:ok, %{compact: false}, _} = join.()

    two_days_ago =
      DateTime.utc_now() |> DateTime.add(-2 * 24 * 60 * 60) |> DateTime.truncate(:second)

    Repo.update_all(from(u in DocUpdate, where: u.doc_id == ^note),
      set: [inserted_at: two_days_ago]
    )

    assert {:ok, %{compact: true}, _} = join.()
  end
end
