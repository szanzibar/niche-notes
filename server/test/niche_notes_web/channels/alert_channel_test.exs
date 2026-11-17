defmodule NicheNotesWeb.AlertChannelTest do
  use NicheNotesWeb.ChannelCase

  alias NicheNotes.Push

  defp join_alerts(user, topic_user, time_zone) do
    subscribe_and_join(
      socket(NicheNotesWeb.UserSocket, nil, current_user_id: user.id),
      "alerts:#{topic_user.id}",
      %{"time_zone" => time_zone}
    )
  end

  test "a desktop app that joined is one more device for its person's alerts" do
    me = user!("me")
    other = user!("other")
    assert {:ok, _, _} = join_alerts(me, me, "Europe/Zurich")

    assert [%{time_zone: "Europe/Zurich", updated_at: %DateTime{}} = desktop] =
             Push.subscriptions([me.id, other.id])

    Push.send(desktop, %{title: "Pay rent", note: "n1"})
    assert_push "alert", %{title: "Pay rent", note: "n1"}
  end

  test "the join needs a real time zone, and nobody listens to someone else's alerts" do
    me = user!("me")
    other = user!("other")
    assert {:error, %{reason: "time zone"}} = join_alerts(me, me, "Mars/Olympus")
    assert {:error, %{reason: "forbidden"}} = join_alerts(other, me, "Europe/Zurich")
    assert Push.subscriptions([me.id]) == []
  end
end
