defmodule NicheNotes.Docs do
  @moduledoc """
  Y.js documents as opaque update logs. A doc is a user's tree (id == owner_id) or a note.
  The server stores who owns what and who it is shared with, and never reads a document.
  """
  import Ecto.Query
  alias NicheNotes.Repo
  alias NicheNotes.Accounts.User
  alias NicheNotes.Docs.{Doc, DocShare, DocUpdate}

  # The first join of an unknown id creates the doc. That is how a note written offline reaches the server.
  def open(doc_id, user_id) do
    case Ecto.UUID.cast(doc_id) do
      {:ok, _} ->
        Repo.insert(%Doc{id: doc_id, owner_id: user_id}, on_conflict: :nothing)
        if can_access?(doc_id, user_id), do: :ok, else: :forbidden

      :error ->
        :forbidden
    end
  end

  def can_access?(doc_id, user_id) do
    Repo.exists?(from d in Doc, where: d.id == ^doc_id and d.owner_id == ^user_id) or
      Repo.exists?(from s in DocShare, where: s.doc_id == ^doc_id and s.user_id == ^user_id)
  end

  def updates_since(doc_id, since) do
    rows =
      Repo.all(
        from u in DocUpdate,
          where: u.doc_id == ^doc_id and u.id > ^since,
          order_by: u.id,
          select: {u.id, u.update}
      )

    seq =
      case List.last(rows) do
        nil -> since
        {id, _} -> id
      end

    {rows, seq}
  end

  def append_update(doc_id, update) do
    Repo.insert!(%DocUpdate{doc_id: doc_id, update: update})
  end

  def list_shares(user_id) do
    Repo.all(
      from s in DocShare,
        join: d in assoc(s, :doc),
        where: d.owner_id == ^user_id or s.user_id == ^user_id,
        select: %{doc_id: s.doc_id, user_id: s.user_id, owner_id: d.owner_id}
    )
  end

  def share(doc_id, owner_id, user_id) do
    with {:ok, doc} <- owned_note(doc_id, owner_id),
         %User{} <- Repo.get(User, user_id) || {:error, :not_found} do
      Repo.insert(%DocShare{doc_id: doc.id, user_id: user_id}, on_conflict: :nothing)
    end
  end

  def unshare(doc_id, owner_id, user_id) do
    with {:ok, doc} <- owned_note(doc_id, owner_id) do
      Repo.delete_all(from s in DocShare, where: s.doc_id == ^doc.id and s.user_id == ^user_id)
      :ok
    end
  end

  # The tree doc has id == owner_id and is never shared.
  defp owned_note(doc_id, owner_id) do
    with {:ok, _} <- Ecto.UUID.cast(doc_id),
         %Doc{owner_id: ^owner_id, id: id} = doc when id != owner_id <- Repo.get(Doc, doc_id) do
      {:ok, doc}
    else
      _ -> {:error, :forbidden}
    end
  end
end
