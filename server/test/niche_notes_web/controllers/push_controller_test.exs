defmodule NicheNotesWeb.PushControllerTest do
  use NicheNotesWeb.ConnCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1]

  test "a device subscribes with its time zone, and one the server doesn't know is refused", %{
    conn: conn
  } do
    conn = Plug.Test.init_test_session(conn, %{user_id: user!("me").id})
    assert %{"key" => key} = json_response(get(conn, "/api/push_key"), 200)
    assert <<4, _::binary-64>> = Base.url_decode64!(key, padding: false)

    {public, _} = :crypto.generate_key(:ecdh, :prime256v1)

    keys = %{
      "p256dh" => Base.url_encode64(public, padding: false),
      "auth" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)
    }

    subscription = %{"endpoint" => "https://push.example/me", "keys" => keys}

    assert response(
             put(conn, "/api/push_subscriptions", %{
               subscription: subscription,
               time_zone: "America/Denver"
             }),
             204
           )

    assert response(
             put(conn, "/api/push_subscriptions", %{
               subscription: subscription,
               time_zone: "Mars/Olympus"
             }),
             422
           )
  end
end
