defmodule NicheNotesWeb.DocControllerTest do
  use NicheNotesWeb.ConnCase

  import Ecto.Query
  import NicheNotesWeb.ChannelCase, only: [edit!: 2, user!: 1]
  alias NicheNotes.Docs

  test "a note's history is every row with its time, for whoever may open the note", %{conn: conn} do
    [me, other, stranger] = for name <- ~w(me other stranger), do: user!(name)
    note = Ecto.UUID.generate()
    {:ok, _} = Docs.open(note, me.id)
    {:ok, _} = Docs.share(note, me.id, other.id)
    one = edit!(note, &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "title", "one"))
    two = edit!(note, &Yex.Map.set(Yex.Doc.get_map(&1, "meta"), "title", "two"))

    NicheNotes.Repo.update_all(from(u in Docs.DocUpdate, where: u.id == ^one.id),
      set: [inserted_at: nil]
    )

    history = fn user ->
      conn |> Plug.Test.init_test_session(%{user_id: user.id}) |> get("/api/docs/#{note}/history")
    end

    rows = [
      [one.id, nil, Base.encode64(one.update)],
      [two.id, DateTime.to_iso8601(two.inserted_at), Base.encode64(two.update)]
    ]

    assert json_response(history.(me), 200) == %{"rows" => rows}
    assert json_response(history.(other), 200) == %{"rows" => rows}
    assert json_response(history.(stranger), 403)
  end
end
