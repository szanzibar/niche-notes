defmodule NicheNotes.RemindersTest do
  use NicheNotes.DataCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1, edit!: 2]
  alias NicheNotes.{Docs, Push, Reminders}

  test "a dated line alerts everyone on its note at its time, or 9:00 without one, in each device's time zone" do
    me = user!("me")
    other = user!("other")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    {:ok, _} = Docs.share(note, me.id, other.id)

    for {user, place, zone} <- [
          {me, "denver", "America/Denver"},
          {other, "amsterdam", "Europe/Amsterdam"}
        ] do
      {public, _} = :crypto.generate_key(:ecdh, :prime256v1)

      keys = %{
        "p256dh" => Base.url_encode64(public, padding: false),
        "auth" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
      }

      {:ok, _} =
        Push.subscribe(
          user.id,
          %{"endpoint" => "https://push.example/#{place}", "keys" => keys},
          zone
        )
    end

    item = fn text, attrs ->
      paragraph = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])
      Yex.XmlElementPrelim.new("taskItem", [paragraph], attrs)
    end

    edit!(note, fn doc ->
      Yex.XmlFragment.push(
        Yex.Doc.get_xml_fragment(doc, "content"),
        Yex.XmlElementPrelim.new("taskList", [
          item.("Pay rent", %{"checked" => false, "due" => "2026-11-14"}),
          item.("Call the plumber", %{"checked" => false, "due" => "2026-11-14T15:30"}),
          item.("Paid already", %{"checked" => true, "due" => "2026-11-14"}),
          item.("Garbled", %{"checked" => false, "due" => "soon"})
        ])
      )
    end)

    test = self()

    Req.Test.stub(Push, fn conn ->
      send(test, {:push, conn.request_path})
      Plug.Conn.send_resp(conn, 201, "")
    end)

    # 9:00 in Amsterdam is 8:00 UTC.
    state =
      Reminders.pass(
        %{notes: %{}, seen: 0, at: ~U[2026-11-14 07:00:00Z]},
        ~U[2026-11-14 08:30:00Z]
      )

    assert_received {:push, "/amsterdam"}
    refute_received {:push, _}

    # 15:30 in Amsterdam is 14:30 UTC, and 9:00 in Denver is 16:00 UTC.
    state = Reminders.pass(state, ~U[2026-11-14 16:30:00Z])
    assert_received {:push, "/amsterdam"}
    assert_received {:push, "/denver"}
    refute_received {:push, _}

    # 15:30 in Denver is 22:30 UTC.
    Reminders.pass(state, ~U[2026-11-14 23:00:00Z])
    assert_received {:push, "/denver"}
    refute_received {:push, _}
  end

  test "a repeating line alerts on each of its days until it's ticked, so one missed day doesn't silence the next" do
    me = user!("me")
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    {public, _} = :crypto.generate_key(:ecdh, :prime256v1)

    keys = %{
      "p256dh" => Base.url_encode64(public, padding: false),
      "auth" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
    }

    {:ok, _} =
      Push.subscribe(
        me.id,
        %{"endpoint" => "https://push.example/phone", "keys" => keys},
        "Europe/Amsterdam"
      )

    edit!(note, fn doc ->
      items =
        for {text, repeat} <- [
              {"Vitamins", "FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA"},
              {"Bins", "FREQ=WEEKLY;BYDAY=MO"}
            ] do
          paragraph = Yex.XmlElementPrelim.new("paragraph", [Yex.XmlTextPrelim.from(text)])
          attrs = %{"checked" => false, "due" => "2026-11-16T09:00", "repeat" => repeat}
          Yex.XmlElementPrelim.new("taskItem", [paragraph], attrs)
        end

      Yex.XmlFragment.push(
        Yex.Doc.get_xml_fragment(doc, "content"),
        Yex.XmlElementPrelim.new("taskList", items)
      )
    end)

    test = self()

    Req.Test.stub(Push, fn conn ->
      send(test, :push)
      Plug.Conn.send_resp(conn, 201, "")
    end)

    # Monday at 9:00 in Amsterdam, 8:00 UTC, both lines come due and nobody ticks them.
    state =
      Reminders.pass(
        %{notes: %{}, seen: 0, at: ~U[2026-11-16 07:00:00Z]},
        ~U[2026-11-16 08:30:00Z]
      )

    assert_received :push
    assert_received :push
    refute_received :push

    # Tuesday only the daily line comes round again.
    Reminders.pass(%{state | at: ~U[2026-11-17 07:00:00Z]}, ~U[2026-11-17 08:30:00Z])
    assert_received :push
    refute_received :push
  end

  test "the server reads repeat rules the way the app does" do
    # The app's own cases in dates.spec.ts, from Monday 16 November 2026: the rule's first day after today, or
    # after the line's date when that is later.
    next = fn due, rule, today ->
      start = Date.from_iso8601!(due)

      Enum.max([start, today], Date)
      |> Date.add(1)
      |> Stream.iterate(&Date.add(&1, 1))
      |> Enum.find(&Reminders.occurs?(rule, start, &1))
    end

    today = ~D[2026-11-16]
    assert next.("2026-11-16", "FREQ=WEEKLY;BYDAY=MO,TH", today) == ~D[2026-11-19]
    assert next.("2026-11-15", "FREQ=WEEKLY;INTERVAL=2;BYDAY=SU", today) == ~D[2026-11-29]
    assert next.("2026-11-01", "FREQ=MONTHLY;BYDAY=1SU,3SU", ~D[2026-11-01]) == ~D[2026-11-15]
    assert next.("2026-11-15", "FREQ=MONTHLY;BYDAY=1SU,3SU", today) == ~D[2026-12-06]
    assert next.("2026-11-29", "FREQ=MONTHLY;BYDAY=-1SU", ~D[2026-11-29]) == ~D[2026-12-27]
    assert next.("2026-10-31", "FREQ=MONTHLY;BYMONTHDAY=31", today) == ~D[2026-12-31]
    assert next.("2026-11-14", "FREQ=YEARLY", today) == ~D[2027-11-14]
    assert next.("2026-11-10", "FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA", today) == ~D[2026-11-17]
  end
end
