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
    with {:ok, _} <- Ecto.UUID.cast(doc_id),
         {:ok, _} <- Repo.insert(%Doc{id: doc_id, owner_id: user_id}, on_conflict: :nothing),
         %Doc{owner_id: owner_id} <- Repo.get(Doc, doc_id),
         true <- owner_id == user_id or shared_with?(doc_id, user_id) do
      {:ok, owner_id}
    else
      _ -> :forbidden
    end
  end

  def can_access?(doc_id, user_id) do
    Repo.exists?(from d in Doc, where: d.id == ^doc_id and d.owner_id == ^user_id) or
      shared_with?(doc_id, user_id)
  end

  defp shared_with?(doc_id, user_id) do
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

  @compact_rows 50
  @compact_idle_seconds 24 * 60 * 60

  # Whether the joining client should fold the log into one snapshot: a busy doc, or one nobody has
  # touched for a day that is still more than one row. Rows from before timestamps count as old.
  def compact?(doc_id) do
    {rows, last} =
      Repo.one(
        from u in DocUpdate,
          where: u.doc_id == ^doc_id,
          select: {count(u.id), max(u.inserted_at)}
      )

    idle = last == nil or DateTime.diff(DateTime.utc_now(), last) > @compact_idle_seconds
    rows > @compact_rows or (rows > 1 and idle)
  end

  def append_update(doc_id, update) do
    Repo.insert!(%DocUpdate{doc_id: doc_id, update: update})
  end

  # The merged state of every row up to `upto` replaces those rows and takes the last one's seq,
  # so a client's `since` keeps meaning "I hold everything up to here".
  def snapshot(doc_id, upto, update) do
    Repo.transaction(fn ->
      Repo.delete_all(from u in DocUpdate, where: u.doc_id == ^doc_id and u.id <= ^upto)
      Repo.insert!(%DocUpdate{id: upto, doc_id: doc_id, update: update})
    end)
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

  # Deleting a note is a flag inside the doc. This is the trash being emptied: rows gone for good.
  def purge(doc_id, owner_id) do
    with {:ok, doc} <- owned_note(doc_id, owner_id) do
      Repo.delete!(doc)
      :ok
    end
  end

  # The owner can remove anyone, and anyone can remove themselves.
  def unshare(doc_id, caller_id, user_id) do
    with {:ok, _} <- Ecto.UUID.cast(doc_id),
         %Doc{owner_id: owner_id, id: id}
         when id != owner_id and (owner_id == caller_id or caller_id == user_id) <-
           Repo.get(Doc, doc_id) do
      Repo.delete_all(from s in DocShare, where: s.doc_id == ^doc_id and s.user_id == ^user_id)
      {:ok, owner_id}
    else
      _ -> {:error, :forbidden}
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
