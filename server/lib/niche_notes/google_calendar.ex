defmodule NicheNotes.GoogleCalendar do
  @moduledoc """
  Each person who connects Google Calendar gets a Niche Notes calendar in their own Google account, holding
  every dated checkbox line they can open. The app writes the events, because a subscribed feed refreshes
  about once a day and Google Calendar's Android app can't add one.

  The grant covers only calendars this app created, the narrowest one Google offers. Sync goes one way. Once a
  minute, each person whose dated lines changed has their calendar listed and corrected, so Google hears
  nothing while nothing changes. An event edited in Google Calendar stays that way until its line changes,
  so edits belong in Niche Notes.
  """
  use GenServer
  use Phoenix.VerifiedRoutes, endpoint: NicheNotesWeb.Endpoint, router: NicheNotesWeb.Router
  import Ecto.Query
  require Logger
  alias NicheNotes.{Docs, Reminders, Repo}
  alias NicheNotes.GoogleCalendar.Connection

  @token_url "https://oauth2.googleapis.com/token"

  # Google hands out a lasting grant only with offline access, and only on a fresh consent.
  @oauth [
    base_url: "https://accounts.google.com",
    authorize_url: "/o/oauth2/v2/auth",
    token_url: @token_url,
    user_url: "https://openidconnect.googleapis.com/v1/userinfo",
    client_authentication_method: :client_secret_post,
    authorization_params: [
      scope: "openid email https://www.googleapis.com/auth/calendar.app.created",
      access_type: "offline",
      prompt: "consent"
    ]
  ]

  def connect_url, do: Assent.Strategy.OAuth2.authorize_url(config())

  # Google's answer to the consent screen. The calendar takes the time zone of the device that connected, and
  # the first sync follows at once.
  def connect(user_id, params, session_params, time_zone) do
    time_zone = if match?({:ok, _}, DateTime.now(time_zone || "")), do: time_zone, else: "Etc/UTC"
    config = Keyword.put(config(), :session_params, session_params)

    with {:ok,
          %{
            user: %{"email" => email},
            token: %{"access_token" => access, "refresh_token" => refresh}
          }} <-
           Assent.Strategy.OAuth2.callback(config, params),
         {:ok, %{status: 200, body: %{"id" => calendar_id}}} <-
           Req.post(google(access),
             url: "/calendars",
             json: %{
               summary: "Niche Notes",
               description:
                 "Dated checkbox lines from Niche Notes. Edit them there, since changes made here don't reach it.",
               timeZone: time_zone
             }
           ) do
      Repo.insert!(
        %Connection{
          user_id: user_id,
          calendar_id: calendar_id,
          email: email,
          refresh_token: Plug.Crypto.encrypt(secret(), "google", refresh),
          time_zone: time_zone
        },
        on_conflict: :replace_all,
        conflict_target: :user_id
      )

      GenServer.cast(__MODULE__, :sync)
    end
  end

  def email(user_id),
    do: Repo.one(from c in Connection, where: c.user_id == ^user_id, select: c.email)

  # Deleting the calendar takes its events off every device. Both calls are best effort, since the person may
  # already have deleted the calendar or removed the app's access in their Google account.
  def disconnect(user_id) do
    with %Connection{} = connection <- Repo.get(Connection, user_id) do
      with {:ok, access} <- access_token(connection),
           do: Req.delete(google(access), url: path(connection))

      Req.post(req([]),
        url: "https://oauth2.googleapis.com/revoke",
        form: [token: refresh_token(connection)]
      )

      Repo.delete!(connection)
    end

    :ok
  end

  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    send(self(), :sync)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:sync, synced) do
    Process.send_after(self(), :sync, :timer.minutes(1))
    {:noreply, sync(synced)}
  end

  @impl true
  def handle_cast(:sync, synced), do: {:noreply, sync(synced)}

  # `synced` holds the events each calendar had after its last sync. A restart starts empty, so every
  # calendar is checked once.
  @doc false
  def sync(synced) do
    notes = Reminders.notes()

    for connection <- Repo.all(Connection), reduce: synced do
      synced ->
        wanted = events(connection, notes)
        keys = wanted |> Map.keys() |> MapSet.new()

        if synced[connection.calendar_id] == keys do
          synced
        else
          case write(connection, wanted) do
            :ok ->
              Map.put(synced, connection.calendar_id, keys)

            # The person removed the app's access or deleted the calendar, so Settings offers Connect again.
            {:error, :gone} ->
              Repo.delete!(connection)
              synced

            error ->
              Logger.warning(
                "Google Calendar sync for #{connection.user_id} failed: #{inspect(error)}"
              )

              synced
          end
        end
    end
  end

  defp write(connection, wanted) do
    with {:ok, access} <- access_token(connection),
         google = google(access),
         {:ok, listed} <- list(google, path(connection)) do
      results =
        for(
          {key, id} <- listed,
          not Map.has_key?(wanted, key),
          do: Req.delete(google, url: "#{path(connection)}/events/#{id}")
        ) ++
          for {key, event} <- wanted, not Map.has_key?(listed, key) do
            Req.post(google,
              url: "#{path(connection)}/events",
              json: Map.put(event, :extendedProperties, %{private: %{key: key}})
            )
          end

      Enum.find_value(results, :ok, fn
        {:ok, %{status: status}} when status in 200..299 or status == 410 -> nil
        other -> {:error, other}
      end)
    end
  end

  # Events someone added to the calendar by hand carry no key and are left alone.
  defp list(google, path, page \\ nil, found \\ %{}) do
    params =
      [maxResults: 2500, fields: "items(id,extendedProperties),nextPageToken"] ++
        List.wrap(page && {:pageToken, page})

    case Req.get(google, url: "#{path}/events", params: params) do
      {:ok, %{status: 200, body: body}} ->
        found =
          for %{"id" => id, "extendedProperties" => %{"private" => %{"key" => key}}} <-
                body["items"] || [],
              into: found,
              do: {key, id}

        if body["nextPageToken"],
          do: list(google, path, body["nextPageToken"], found),
          else: {:ok, found}

      {:ok, %{status: status}} when status in [404, 410] ->
        {:error, :gone}

      other ->
        {:error, other}
    end
  end

  # Google only hears about a person whose events changed, so a fresh token for each sync costs one request
  # in a few a day.
  defp access_token(connection) do
    form = [
      client_id: config()[:client_id],
      client_secret: config()[:client_secret],
      refresh_token: refresh_token(connection),
      grant_type: "refresh_token"
    ]

    case Req.post(req([]), url: @token_url, form: form) do
      {:ok, %{status: 200, body: %{"access_token" => access}}} -> {:ok, access}
      {:ok, %{status: 400, body: %{"error" => "invalid_grant"}}} -> {:error, :gone}
      other -> {:error, other}
    end
  end

  defp events(connection, notes) do
    for {id, {title, lines}} <- Map.take(notes, Docs.note_ids(connection.user_id)),
        line <- lines,
        into: %{} do
      event = event(id, title, line, connection.time_zone)

      {:crypto.hash(:sha256, :erlang.term_to_binary(event, [:deterministic]))
       |> Base.url_encode64(padding: false), event}
    end
  end

  # All day, or half an hour from its time. Its only alert is the app's own, which has Done and Snooze.
  defp event(id, title, line, time_zone) do
    {start, finish} =
      case line do
        %{time: nil} ->
          {%{date: Date.to_iso8601(line.date)}, %{date: Date.to_iso8601(Date.add(line.date, 1))}}

        %{time: time} ->
          at = NaiveDateTime.new!(line.date, time)
          wall = &%{dateTime: NaiveDateTime.to_iso8601(&1), timeZone: time_zone}
          {wall.(at), wall.(NaiveDateTime.add(at, 30, :minute))}
      end

    %{
      summary: line.text,
      description: "#{title}\nEdit in Niche Notes: #{url(~p"/n/#{id}?#{[line: line.text]}")}",
      start: start,
      end: finish,
      recurrence: List.wrap(line.repeat && "RRULE:#{line.repeat}"),
      reminders: %{useDefault: false}
    }
  end

  defp path(connection),
    do: "/calendars/#{URI.encode(connection.calendar_id, &URI.char_unreserved?/1)}"

  defp google(access),
    do: req(base_url: "https://www.googleapis.com/calendar/v3", auth: {:bearer, access})

  defp req(options), do: Req.new(options ++ Application.get_env(:niche_notes, :google_req, []))

  defp refresh_token(connection),
    do:
      Plug.Crypto.decrypt(secret(), "google", connection.refresh_token, max_age: :infinity)
      |> elem(1)

  defp secret, do: NicheNotesWeb.Endpoint.config(:secret_key_base)

  defp config, do: Keyword.merge(@oauth, Application.fetch_env!(:niche_notes, :google))
end
