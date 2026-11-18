defmodule NicheNotes.Push do
  @moduledoc """
  Web Push to every device where someone allowed alerts. On Android, Chrome hands each push to our app, which
  shows it as its own.

  The signing key comes from SECRET_KEY_BASE, so there is nothing to configure. Changing that secret signs
  everyone out anyway, and each device subscribes again on its next launch.

  The Android app on Tauri has no Web Push, so its alerts go through Firebase, as the service account in
  FIREBASE_SERVICE_ACCOUNT.

  A desktop app has no Web Push, so it listens on the socket and gets each alert as it is sent. One sent
  while the computer is off goes nowhere, because the phone has it too and nobody wants stale alerts on
  coming back.
  """
  import Ecto.Query
  require Logger
  alias NicheNotes.Repo
  alias NicheNotes.Push.Subscription

  # Each launch sends the device's subscription again, so its time zone stays current.
  def subscribe(user_id, subscription, time_zone) when is_binary(time_zone) do
    with {:ok, _} <- DateTime.now(time_zone),
         {:ok, %Subscription{} = subscription} <- parse(subscription) do
      Repo.insert(
        %{subscription | user_id: user_id, time_zone: time_zone},
        on_conflict: {:replace, [:user_id, :p256dh, :auth, :time_zone, :updated_at]},
        conflict_target: :endpoint
      )
    else
      _ -> {:error, :subscription}
    end
  end

  def subscribe(_user_id, _subscription, _time_zone), do: {:error, :subscription}

  defp parse(%{
         "endpoint" => "https://" <> _ = endpoint,
         "keys" => %{"p256dh" => p256dh, "auth" => auth}
       })
       when is_binary(p256dh) and is_binary(auth) do
    with {:ok, <<4, _::binary-64>>} <- Base.url_decode64(p256dh, padding: false),
         {:ok, <<_::binary-16>>} <- Base.url_decode64(auth, padding: false) do
      {:ok, %Subscription{endpoint: endpoint, p256dh: p256dh, auth: auth}}
    end
  end

  # The Android app's Firebase token. Firebase encrypts on its own, so the token has no keys, and the columns
  # SQLite keeps required stay empty.
  defp parse(%{"fcm" => token}) when is_binary(token) and token != "",
    do: {:ok, %Subscription{endpoint: "fcm:" <> token, p256dh: "", auth: ""}}

  defp parse(_subscription), do: :error

  # The calling process is one more device of this person's for as long as it lives, and gets each alert as
  # `{:alert, message}`.
  def listen(user_id, time_zone) do
    with {:ok, now} <- DateTime.now(time_zone),
         {:ok, _} <- Registry.register(__MODULE__, user_id, {time_zone, now}) do
      :ok
    end
  end

  def subscriptions(user_ids) do
    listening =
      for id <- user_ids, {pid, {time_zone, since}} <- Registry.lookup(__MODULE__, id) do
        %{pid: pid, time_zone: time_zone, updated_at: since}
      end

    Repo.all(from s in Subscription, where: s.user_id in ^user_ids) ++ listening
  end

  def public_key, do: keys() |> elem(0) |> encode()

  def send(%{pid: pid}, message), do: Kernel.send(pid, {:alert, message})

  # Kept for a day, so a phone that was off still gets it when it comes back.
  def send(%Subscription{} = subscription, message),
    do: deliver(subscription, message, %{priority: "high", ttl: "86400s"})

  # Only the Android app has widgets. At normal priority, since Firebase holds back an app whose high priority
  # messages show nothing, and one waiting for a phone that is asleep replaces the one before.
  def refresh_widgets(user_ids) do
    for subscription <-
          Repo.all(
            from s in Subscription,
              where: s.user_id in ^user_ids and like(s.endpoint, "fcm:%")
          ),
        do:
          deliver(subscription, %{widgets: "refresh"}, %{
            priority: "normal",
            collapse_key: "widgets"
          })
  end

  # A device that unsubscribed is forgotten.
  defp deliver(subscription, message, android) do
    case post(subscription, message, android) do
      {:ok, %{status: status}} when status in 200..299 ->
        :ok

      {:ok, %{status: status}} when status in [404, 410] ->
        Logger.info("push: #{subscription.endpoint} is no longer subscribed")
        Repo.delete!(subscription)

      failed ->
        Logger.warning("push to #{subscription.endpoint} failed: #{inspect(failed)}")
    end
  end

  # The app shows the alert itself, so Firebase gets only data, which it takes as strings.
  defp post(%Subscription{endpoint: "fcm:" <> token}, message, android) do
    account =
      Application.fetch_env!(:niche_notes, :firebase_service_account)
      |> Base.decode64!()
      |> Jason.decode!()

    data = for {key, value} <- message, value != nil, into: %{}, do: {key, to_string(value)}

    grant = [
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion(account)
    ]

    # A new access token for each message, which a family's few hundred a day can afford.
    with {:ok, %{status: 200, body: %{"access_token" => access}}} <-
           Req.post(
             account["token_uri"],
             [form: grant] ++ Application.get_env(:niche_notes, :push_req, [])
           ) do
      Req.post(
        "https://fcm.googleapis.com/v1/projects/#{account["project_id"]}/messages:send",
        [
          auth: {:bearer, access},
          json: %{
            message: %{token: token, data: data, android: android}
          }
        ] ++ Application.get_env(:niche_notes, :push_req, [])
      )
    end
  end

  defp post(subscription, message, _android) do
    body = encrypt(Jason.encode!(message), decode(subscription.p256dh), decode(subscription.auth))

    headers = [
      {"authorization", vapid(subscription.endpoint)},
      {"content-encoding", "aes128gcm"},
      {"ttl", "86400"},
      {"urgency", "high"}
    ]

    Req.post(
      subscription.endpoint,
      [body: body, headers: headers] ++ Application.get_env(:niche_notes, :push_req, [])
    )
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

  # RFC 7523: Google trades a claim signed with the service account's key for an hour's access.
  defp assertion(%{"client_email" => email, "private_key" => pem, "token_uri" => audience}) do
    now = System.system_time(:second)

    claims = %{
      iss: email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: audience,
      iat: now,
      exp: now + 3600
    }

    input = encode(~s({"alg":"RS256","typ":"JWT"})) <> "." <> encode(Jason.encode!(claims))
    [key] = :public_key.pem_decode(pem)
    input <> "." <> encode(:public_key.sign(input, :sha256, :public_key.pem_entry_decode(key)))
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
