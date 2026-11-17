defmodule NicheNotesWeb.Plugs.HandOff do
  @moduledoc """
  The desktop app opens Pocket ID's and Google's pages in the default browser, because a passkey can't work in
  its window. They send that browser back to our callback, while the app's window started the login and holds
  its `state`. So a callback whose `state` this session never asked for goes on to the app as a `nichenotes://`
  link, and the app loads the same callback in its window with `app=1`.

  With `app=1` nothing is handed on, so a link the window never asked for only reloads the notes.
  """
  import Plug.Conn
  import Phoenix.Controller, only: [html: 2, redirect: 2]

  # `state` is where the flow keeps its state in the session.
  def init(state: path), do: path

  def call(conn, path) do
    state = conn.params["state"]

    cond do
      state != nil and state == get_in(get_session(conn), path) ->
        conn

      conn.params["app"] == "1" ->
        conn |> redirect(to: "/") |> halt()

      true ->
        "/auth/" <> callback = conn.request_path
        link = Plug.HTML.html_escape("nichenotes://#{callback}?#{conn.query_string}")

        conn
        |> html("""
        <!doctype html>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Niche Notes</title>
        <body style="margin:0; height:100dvh; display:grid; place-items:center; background:#FAFAF8; font:700 1rem system-ui, sans-serif">
        <a href="#{link}" style="border:2px solid #111; box-shadow:4px 4px 0 #111; padding:0.75rem 1.25rem; background:#FF4F3B; color:#fff; text-decoration:none">Open Niche Notes</a>
        <script>location.href = document.links[0].href</script>
        """)
        |> halt()
    end
  end
end
