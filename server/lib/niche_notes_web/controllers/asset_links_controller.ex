defmodule NicheNotesWeb.AssetLinksController do
  use NicheNotesWeb, :controller

  # Names the Android app that may open this site without an address bar. The app's id and signing key
  # come from the environment, so a server without the app lists none.
  def show(conn, _params) do
    android = Application.get_env(:niche_notes, :android, [])

    links =
      if android[:app_id] && android[:cert_sha256] do
        [
          %{
            relation: ["delegate_permission/common.handle_all_urls"],
            target: %{
              namespace: "android_app",
              package_name: android[:app_id],
              sha256_cert_fingerprints: [android[:cert_sha256]]
            }
          }
        ]
      else
        []
      end

    json(conn, links)
  end
end
