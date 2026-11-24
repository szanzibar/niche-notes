defmodule NicheNotesWeb.DocChannelTest do
  use NicheNotesWeb.ChannelCase

  import Ecto.Query
  import ExUnit.CaptureLog

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

  test "someone who can only read joins the note and makes no edits", %{
    me: me,
    other: other,
    note: note
  } do
    {:ok, _} = Docs.open(note, me.id)
    :ok = Docs.create_link(note, me.id, "a-view-link-token", true)
    :ok = "a-view-link-token" |> Docs.by_link() |> Docs.join(other.id)

    {:ok, _, theirs} =
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: other.id),
        "doc:#{note}"
      )

    ref = push(theirs, "update", %{"update" => Base.encode64("edit")})
    assert_reply ref, :error, %{reason: "read_only"}
    assert {[], _} = Docs.updates_since(note, 0)
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

  test "an update the log already holds is not stored or relayed again, as when a device sends its notes again",
       %{me: me, note: note} do
    {:ok, _, mine} =
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
        "doc:#{note}"
      )

    {:ok, _, _my_other_device} =
      subscribe_and_join(
        socket(NicheNotesWeb.UserSocket, nil, current_user_id: me.id),
        "doc:#{note}"
      )

    ref = push(mine, "update", %{"update" => Base.encode64("one")})
    assert_reply ref, :ok, %{seq: seq}
    assert_push "update", %{seq: ^seq}

    ref = push(mine, "update", %{"update" => Base.encode64("one")})
    assert_reply ref, :ok, %{seq: ^seq}
    refute_push "update", _
    assert Repo.aggregate(from(u in DocUpdate, where: u.doc_id == ^note), :count) == 1
  end

  test "a device that places a note without having seen the place its person chose gets them an alert",
       %{me: me, note: note} do
    {public, _} = :crypto.generate_key(:ecdh, :prime256v1)

    keys = %{
      "p256dh" => Base.url_encode64(public, padding: false),
      "auth" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
    }

    {:ok, _} =
      NicheNotes.Push.subscribe(
        me.id,
        %{"endpoint" => "https://push.example/phone", "keys" => keys},
        "Europe/Zurich"
      )

    {:ok, _, tree} = join_doc(me, me.id, 0)
    test = self()

    Req.Test.stub(NicheNotes.Push, fn conn ->
      send(test, :alert)
      Plug.Conn.send_resp(conn, 201, "")
    end)

    Req.Test.allow(NicheNotes.Push, test, tree.channel_pid)

    # A device changes a place on the tree it holds, and sends the change.
    place = fn device, id, node ->
      {:ok, before} = Yex.encode_state_vector(device)
      Yex.Map.set(Yex.Doc.get_map(device, "nodes"), id, node)
      {:ok, update} = Yex.encode_state_as_update(device, before)
      ref = push(tree, "update", %{"update" => Base.encode64(update)})
      assert_reply ref, :ok, _
      update
    end

    desk = Yex.Doc.new()
    fresh = Ecto.UUID.generate()
    place.(desk, note, %{"parent" => nil, "order" => 1})
    moved = place.(desk, note, %{"parent" => "kids", "order" => 2})
    place.(desk, fresh, %{"parent" => nil, "order" => 3})
    refute_received :alert

    # A second device that never saw the first places both notes. One had only the place a shared note starts with.
    phone = Yex.Doc.new()
    place.(phone, fresh, %{"parent" => nil, "order" => 4})
    refute_received :alert

    log = capture_log(fn -> place.(phone, note, %{"parent" => nil, "order" => 5}) end)
    assert_received :alert
    assert log =~ note

    # A device sending what the server already holds placed nothing.
    ref = push(tree, "update", %{"update" => Base.encode64(moved)})
    assert_reply ref, :ok, _
    {:ok, whole} = Yex.encode_state_as_update(phone)
    ref = push(tree, "update", %{"update" => Base.encode64(whole)})
    assert_reply ref, :ok, _
    refute_received :alert
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

  defp stamp!(row, at) do
    Repo.update_all(from(u in DocUpdate, where: u.id == ^row.id), set: [inserted_at: at])
    at
  end

  defp log(note),
    do:
      Repo.all(
        from u in DocUpdate,
          where: u.doc_id == ^note,
          order_by: u.id,
          select: {u.id, u.inserted_at}
      )

  @now ~U[2026-11-24 12:20:30Z]

  # One row per time, folded as of @now, and the ids they were stored under.
  defp fold!(me, note, times) do
    {:ok, _} = Docs.open(note, me.id)

    ids =
      for {at, i} <- Enum.with_index(times),
          do: title!(note, "#{i}") |> tap(&stamp!(&1, at)) |> Map.get(:id)

    Docs.fold(note, @now)
    ids
  end

  test "a join folds each 10 minutes into one row under its last seq and newest time, which a device holding it all skips",
       %{me: me, note: note} do
    {:ok, %{updates: []}, _} = join_doc(me, note, 0)
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    # Three edits early in one 10 minutes an hour ago, one alone in the 10 minutes before, and one just now.
    start = DateTime.add(now, -3600 - rem(DateTime.to_unix(now), 600))
    [one, two, three, before, now] = for i <- 1..5, do: title!(note, "#{i}")
    stamp!(one, DateTime.add(start, 1))
    stamp!(two, DateTime.add(start, 2))
    at = stamp!(three, DateTime.add(start, 3))
    before_at = stamp!(before, DateTime.add(start, -60))
    last = three.id

    assert {:ok, %{updates: [[^last, folded], _, _]}, _} = join_doc(me, note, one.id)
    doc = Yex.Doc.new()
    :ok = Yex.apply_update(doc, Base.decode64!(folded))
    assert %{"title" => "3"} = Yex.Map.to_map(Yex.Doc.get_map(doc, "meta"))
    assert log(note) == [{last, at}, {before.id, before_at}, {now.id, now.inserted_at}]
    assert {:ok, %{updates: [_, _]}, _} = join_doc(me, note, last)
  end

  test "the last 20 minutes keep one row per minute", %{me: me, note: note} do
    [_, two, three] =
      fold!(me, note, [
        ~U[2026-11-24 12:15:05Z],
        ~U[2026-11-24 12:15:40Z],
        ~U[2026-11-24 12:16:10Z]
      ])

    assert log(note) == [{two, ~U[2026-11-24 12:15:40Z]}, {three, ~U[2026-11-24 12:16:10Z]}]
  end

  test "the day keeps one row per 10 minutes", %{me: me, note: note} do
    [_, two, three] =
      fold!(me, note, [
        ~U[2026-11-24 10:01:00Z],
        ~U[2026-11-24 10:09:00Z],
        ~U[2026-11-24 10:11:00Z]
      ])

    assert log(note) == [{two, ~U[2026-11-24 10:09:00Z]}, {three, ~U[2026-11-24 10:11:00Z]}]
  end

  test "the day before keeps one row per hour", %{me: me, note: note} do
    [_, two, three] =
      fold!(me, note, [
        ~U[2026-11-23 08:05:00Z],
        ~U[2026-11-23 08:55:00Z],
        ~U[2026-11-23 09:05:00Z]
      ])

    assert log(note) == [{two, ~U[2026-11-23 08:55:00Z]}, {three, ~U[2026-11-23 09:05:00Z]}]
  end

  test "two weeks keep one row per UTC day", %{me: me, note: note} do
    [_, two, three] =
      fold!(me, note, [
        ~U[2026-11-20 01:00:00Z],
        ~U[2026-11-20 23:00:00Z],
        ~U[2026-11-21 01:00:00Z]
      ])

    assert log(note) == [{two, ~U[2026-11-20 23:00:00Z]}, {three, ~U[2026-11-21 01:00:00Z]}]
  end

  test "rows older than two weeks, and from before timestamps, fold into one row", %{
    me: me,
    note: note
  } do
    [_, _, three, four] =
      fold!(me, note, [
        nil,
        ~U[2026-11-01 00:00:00Z],
        ~U[2026-11-09 12:00:00Z],
        ~U[2026-11-11 00:00:00Z]
      ])

    assert log(note) == [{three, ~U[2026-11-09 12:00:00Z]}, {four, ~U[2026-11-11 00:00:00Z]}]
  end

  test "the log stays as it is when no bucket holds more than one row", %{me: me, note: note} do
    times = [
      ~U[2026-11-01 00:00:00Z],
      ~U[2026-11-20 00:00:00Z],
      ~U[2026-11-23 08:00:00Z],
      ~U[2026-11-24 10:00:00Z],
      ~U[2026-11-24 12:20:00Z]
    ]

    ids = fold!(me, note, times)
    assert log(note) == Enum.zip(ids, times)
  end

  test "a minute and the 10 minutes that start at the same time never merge", %{
    me: me,
    note: note
  } do
    times = [~U[2026-11-24 12:00:10Z], ~U[2026-11-24 12:00:50Z]]
    ids = fold!(me, note, times)
    assert log(note) == Enum.zip(ids, times)
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
