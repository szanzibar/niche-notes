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

  defp title!(note, title),
    do: edit!(note, &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "title", title))

  defp join_doc(user, note, since),
    do:
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: user.id),
        "doc:#{note}",
        %{"since" => since}
      )

  test "a join folds a long log into one row under the last seq, which a device holding it all skips",
       %{me: me, note: note} do
    {:ok, %{updates: []}, _} = join_doc(me, note, 0)
    rows = for i <- 1..51, do: title!(note, "#{i}")
    last = List.last(rows).id

    assert {:ok, %{updates: [], seq: ^last}, _} = join_doc(me, note, last)
    assert {:ok, %{updates: [[^last, folded]], seq: ^last}, _} = join_doc(me, note, last - 1)

    doc = Yex.Doc.new()
    :ok = Yex.apply_update(doc, Base.decode64!(folded))
    assert %{"title" => "51"} = Yex.Map.to_map(Yex.Doc.get_map(doc, "meta"))

    assert title!(note, "more").id > last
    assert {:ok, %{updates: [_, _]}, _} = join_doc(me, note, 0)
  end

  test "a join folds a log of more than one row after a day of quiet", %{me: me, note: note} do
    {:ok, _, _} = join_doc(me, note, 0)
    title!(note, "one")
    title!(note, "two")
    assert {:ok, %{updates: [_, _]}, _} = join_doc(me, note, 0)

    two_days_ago =
      DateTime.utc_now() |> DateTime.add(-2 * 24 * 60 * 60) |> DateTime.truncate(:second)

    Repo.update_all(from(u in DocUpdate, where: u.doc_id == ^note),
      set: [inserted_at: two_days_ago]
    )

    assert {:ok, %{updates: [_]}, _} = join_doc(me, note, 0)
  end

  test "nothing a device sends takes rows out of the log", %{me: me, note: note} do
    {:ok, _, mine} = join_doc(me, note, 0)
    ref = push(mine, "update", %{"update" => Base.encode64("one")})
    assert_reply ref, :ok, %{seq: seq}

    snapshot = %{"update" => Base.encode64("mine"), "upto" => 9_223_372_036_854_775_807}
    ref = push(mine, "snapshot", snapshot)
    assert_reply ref, :ok

    assert {[{^seq, "one"}], ^seq} = Docs.updates_since(note, 0)
    ref = push(mine, "update", %{"update" => Base.encode64("two")})
    assert_reply ref, :ok, %{seq: _}
  end

  test "a guest's join opens their own tree and never creates a note", %{note: note} do
    {:ok, guest} = NicheNotes.Accounts.create_guest()

    assert {:error, %{reason: "forbidden"}} = join_doc(guest, note, 0)
    refute Repo.get(NicheNotes.Docs.Doc, note)
    assert {:ok, _, _} = join_doc(guest, guest.id, 0)
  end
end
