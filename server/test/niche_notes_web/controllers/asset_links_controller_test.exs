defmodule NicheNotesWeb.AssetLinksControllerTest do
  use NicheNotesWeb.ConnCase

  test "assetlinks.json names the Android app from the environment", %{conn: conn} do
    assert [%{"target" => target}] = json_response(get(conn, "/.well-known/assetlinks.json"), 200)
    assert target["package_name"] == "app.nichenotes.test"
    assert target["sha256_cert_fingerprints"] == ["AA:BB"]
  end
end
