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
end
