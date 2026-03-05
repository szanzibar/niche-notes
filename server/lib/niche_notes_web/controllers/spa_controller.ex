defmodule NicheNotesWeb.SPAController do
  use NicheNotesWeb, :controller

  def index(conn, _params) do
    conn
    |> put_resp_content_type("text/html")
    |> send_file(200, Application.app_dir(:niche_notes, "priv/static/index.html"))
  end
end
