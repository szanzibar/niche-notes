defmodule NicheNotes.PushTest do
  use NicheNotes.DataCase

  import NicheNotesWeb.ChannelCase, only: [user!: 1]
  import Plug.Conn, only: [get_req_header: 2, send_resp: 3]
  alias NicheNotes.Push

  defp decode(text), do: Base.url_decode64!(text, padding: false)
  defp encode(bytes), do: Base.url_encode64(bytes, padding: false)

  test "encrypts the way RFC 8291's example does" do
    sender = {
      decode(
        "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"
      ),
      decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")
    }

    receiver =
      decode(
        "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
      )

    message = "When I grow up, I want to be a watermelon"

    body =
      Push.encrypt(
        message,
        receiver,
        decode("BTBZMqHH6r4Tts7J_aSIgg"),
        sender,
        decode("DGv6ra1nlYgDCS1FRnbzlw")
      )

    assert encode(body) ==
             "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
  end

  test "a push is signed for its push service, and a device that unsubscribed is forgotten" do
    me = user!("me")
    {public, _} = :crypto.generate_key(:ecdh, :prime256v1)
    keys = %{"p256dh" => encode(public), "auth" => encode(:crypto.strong_rand_bytes(16))}

    {:ok, device} =
      Push.subscribe(
        me.id,
        %{"endpoint" => "https://push.example/me", "keys" => keys},
        "America/Denver"
      )

    assert {:error, _} =
             Push.subscribe(
               me.id,
               %{"endpoint" => "https://push.example/me", "keys" => keys},
               "Mars/Olympus"
             )

    test = self()

    Req.Test.stub(Push, fn conn ->
      send(test, conn)
      send_resp(conn, 201, "")
    end)

    assert :ok = Push.send(device, %{title: "Pay rent"})
    assert_received %Plug.Conn{host: "push.example"} = conn

    ["vapid t=" <> jwt, "k=" <> key] =
      conn |> get_req_header("authorization") |> hd() |> String.split(", ")

    assert key == Push.public_key()
    [header, claims, signature] = String.split(jwt, ".")
    <<r::256, s::256>> = decode(signature)
    der = :public_key.der_encode(:"ECDSA-Sig-Value", {:"ECDSA-Sig-Value", r, s})

    assert :crypto.verify(:ecdsa, :sha256, header <> "." <> claims, der, [
             decode(key),
             :prime256v1
           ])

    assert %{"aud" => "https://push.example"} = Jason.decode!(decode(claims))

    Req.Test.stub(Push, &send_resp(&1, 410, ""))
    Push.send(device, %{title: "Pay rent"})
    assert Push.subscriptions([me.id]) == []
  end
end
