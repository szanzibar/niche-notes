defmodule NicheNotes.Push do
  @moduledoc """
  Web Push to every device where someone allowed alerts. On Android, Chrome hands each push to our app, which
  shows it as its own, so no Firebase project is involved.

  The signing key comes from SECRET_KEY_BASE, so there is nothing to configure. Changing that secret signs
  everyone out anyway, and each device subscribes again on its next launch.
  """
  import Ecto.Query
  require Logger
  alias NicheNotes.Repo
  alias NicheNotes.Push.Subscription

  # Each launch sends the device's subscription again, so its time zone stays current.
  def subscribe(
        user_id,
        %{
          "endpoint" => "https://" <> _ = endpoint,
          "keys" => %{"p256dh" => p256dh, "auth" => auth}
        },
        time_zone
      )
      when is_binary(p256dh) and is_binary(auth) and is_binary(time_zone) do
    with {:ok, _} <- DateTime.now(time_zone),
         {:ok, <<4, _::binary-64>>} <- Base.url_decode64(p256dh, padding: false),
         {:ok, <<_::binary-16>>} <- Base.url_decode64(auth, padding: false) do
      Repo.insert(
        %Subscription{
          endpoint: endpoint,
          user_id: user_id,
          p256dh: p256dh,
          auth: auth,
          time_zone: time_zone
        },
        on_conflict: {:replace, [:user_id, :p256dh, :auth, :time_zone, :updated_at]},
        conflict_target: :endpoint
      )
    else
      _ -> {:error, :subscription}
    end
  end

  def subscribe(_user_id, _subscription, _time_zone), do: {:error, :subscription}

  def subscriptions(user_ids), do: Repo.all(from s in Subscription, where: s.user_id in ^user_ids)

  def public_key, do: keys() |> elem(0) |> encode()

  # Kept for a day, so a phone that was off still gets it when it comes back. A device that unsubscribed
  # is forgotten.
  def send(%Subscription{} = subscription, message) do
    body = encrypt(Jason.encode!(message), decode(subscription.p256dh), decode(subscription.auth))

    headers = [
      {"authorization", vapid(subscription.endpoint)},
      {"content-encoding", "aes128gcm"},
      {"ttl", "86400"},
      {"urgency", "high"}
    ]

    request = [body: body, headers: headers] ++ Application.get_env(:niche_notes, :push_req, [])

    case Req.post(subscription.endpoint, request) do
      {:ok, %{status: status}} when status in 200..299 ->
        :ok

      {:ok, %{status: status}} when status in [404, 410] ->
        Logger.info("push: #{subscription.endpoint} is no longer subscribed")
        Repo.delete!(subscription)

      failed ->
        Logger.warning("push to #{subscription.endpoint} failed: #{inspect(failed)}")
    end
  end

  @doc false
  # RFC 8291 as one record, which holds a message of up to 4 KB.
  def encrypt(
        message,
        ua_public,
        auth_secret,
        {as_public, as_private} \\ :crypto.generate_key(:ecdh, :prime256v1),
        salt \\ :crypto.strong_rand_bytes(16)
      ) do
    secret = :crypto.compute_key(:ecdh, ua_public, as_private, :prime256v1)

    ikm =
      hmac(hmac(auth_secret, secret), "WebPush: info" <> <<0>> <> ua_public <> as_public <> <<1>>)

    prk = hmac(salt, ikm)
    <<cek::binary-16, _::binary>> = hmac(prk, "Content-Encoding: aes128gcm" <> <<0, 1>>)
    <<nonce::binary-12, _::binary>> = hmac(prk, "Content-Encoding: nonce" <> <<0, 1>>)

    {cipher, tag} =
      :crypto.crypto_one_time_aead(:aes_128_gcm, cek, nonce, message <> <<2>>, "", true)

    salt <> <<4096::32, byte_size(as_public)::8>> <> as_public <> cipher <> tag
  end

  # RFC 8292: the push service checks this against the key the device subscribed with.
  defp vapid(endpoint) do
    {public, private} = keys()
    %URI{scheme: scheme, host: host} = URI.parse(endpoint)

    claims = %{
      aud: "#{scheme}://#{host}",
      exp: System.system_time(:second) + 12 * 3600,
      sub: NicheNotesWeb.Endpoint.url()
    }

    input = encode(~s({"typ":"JWT","alg":"ES256"})) <> "." <> encode(Jason.encode!(claims))
    der = :crypto.sign(:ecdsa, :sha256, input, [private, :prime256v1])
    {:"ECDSA-Sig-Value", r, s} = :public_key.der_decode(:"ECDSA-Sig-Value", der)
    "vapid t=#{input}.#{encode(<<r::256, s::256>>)}, k=#{encode(public)}"
  end

  defp keys do
    private =
      Plug.Crypto.KeyGenerator.generate(NicheNotesWeb.Endpoint.config(:secret_key_base), "vapid")

    :crypto.generate_key(:ecdh, :prime256v1, private)
  end

  defp hmac(key, data), do: :crypto.mac(:hmac, :sha256, key, data)
  defp encode(bytes), do: Base.url_encode64(bytes, padding: false)
  defp decode(text), do: Base.url_decode64!(text, padding: false)
end
