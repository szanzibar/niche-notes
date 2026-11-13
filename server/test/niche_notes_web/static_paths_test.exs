defmodule NicheNotesWeb.StaticPathsTest do
  use ExUnit.Case, async: true

  # A file the server doesn't list falls through to the app's page, so a service worker importing it fails
  # and every device stays on the old version.
  test "every file the client ships beside its page is served as itself" do
    for name <- File.ls!(Path.expand("../../../client/public", __DIR__)) do
      assert name in NicheNotesWeb.static_paths(),
             "#{name} is missing from NicheNotesWeb.static_paths/0"
    end
  end
end
