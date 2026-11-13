defmodule NicheNotes.Docs do
  @moduledoc """
  Y.js documents as update logs. A doc is a user's tree (id == owner_id) or a note.
  The server stores who owns what and who it is shared with. It reads a note only for work that
  has to happen while every app is closed, such as a home-screen widget, an alert or a calendar.
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

  # A note as plain lines for a widget. One the user can no longer open, or that is in the trash, is gone.
  def read_note(doc_id, user_id) do
    with true <- can_access?(doc_id, user_id),
         {title, meta, content} <- load(doc_id) do
      hide = meta["hideChecked"] == true or meta["deleteChecked"] == true
      {:ok, %{title: title, lines: Enum.flat_map(content, &lines(&1, 0, hide))}}
    else
      _ -> :error
    end
  end

  # A note's title and its unchecked checkbox lines that have a date, at any depth. A note in the trash has none.
  def dated_lines(doc_id) do
    case load(doc_id) do
      {title, _meta, content} -> {title, Enum.flat_map(content, &dated/1)}
      nil -> {nil, []}
    end
  end

  # The notes with rows after `seen`, and the newest row's id.
  def changed_since(seen) do
    rows =
      Repo.all(
        from u in DocUpdate,
          join: d in assoc(u, :doc),
          where: u.id > ^seen and d.id != d.owner_id,
          group_by: u.doc_id,
          select: {u.doc_id, max(u.id)}
      )

    {Enum.map(rows, &elem(&1, 0)), rows |> Enum.map(&elem(&1, 1)) |> Enum.max(fn -> seen end)}
  end

  # Everyone on a note: its owner and whoever it is shared with.
  def member_ids(doc_id) do
    Repo.all(from d in Doc, where: d.id == ^doc_id, select: d.owner_id) ++
      Repo.all(from s in DocShare, where: s.doc_id == ^doc_id, select: s.user_id)
  end

  # Every note a user can open.
  def note_ids(user_id) do
    Repo.all(from d in Doc, where: d.owner_id == ^user_id and d.id != ^user_id, select: d.id) ++
      Repo.all(from s in DocShare, where: s.user_id == ^user_id, select: s.doc_id)
  end

  defp load(doc_id) do
    doc = Yex.Doc.new()
    updates = from u in DocUpdate, where: u.doc_id == ^doc_id, order_by: u.id, select: u.update

    with {:ok, update} <- Yex.merge_updates(Repo.all(updates)),
         :ok <- Yex.apply_update(doc, update),
         meta = doc |> Yex.Doc.get_map("meta") |> Yex.Map.to_map(),
         false <- Map.get(meta, "deleted", false) do
      title = if meta["title"] in [nil, ""], do: "Untitled", else: meta["title"]
      {title, meta, doc |> Yex.Doc.get_xml_fragment("content") |> Yex.XmlFragment.children()}
    else
      _ -> nil
    end
  end

  # A date is "2026-11-14" or "2026-11-14T15:30" in the reader's own time zone. One a device wrote wrong is
  # left out, since the server alerts and draws calendars from these.
  defp dated(%Yex.XmlElement{} = element) do
    children = Enum.to_list(Yex.XmlElement.children(element))
    nested = Enum.flat_map(children, &dated/1)
    attribute = &Yex.XmlElement.get_attribute(element, &1)

    with "taskItem" <- Yex.XmlElement.get_tag(element),
         [%Yex.XmlElement{} = first | _] <- children,
         false <- attribute.("checked") == true,
         due when is_binary(due) <- attribute.("due"),
         [day | time] <- String.split(due, "T", parts: 2),
         {:ok, date} <- Date.from_iso8601(day),
         {:ok, time} <- if(time == [], do: {:ok, nil}, else: Time.from_iso8601("#{time}:00")) do
      repeat =
        if attribute.("repeat") in ~w(daily weekdays weekly monthly yearly),
          do: attribute.("repeat")

      [%{text: text(first), date: date, time: time, repeat: repeat} | nested]
    else
      _ -> nested
    end
  end

  defp dated(_text), do: []

  # One line per paragraph or list item, with nested items indented under their parent. A note that
  # hides or deletes its checked items leaves out each one that is done, with what is nested under it.
  defp lines(element, depth, hide) do
    indent = String.duplicate("    ", depth)

    case Yex.XmlElement.get_tag(element) do
      list when list in ["bulletList", "orderedList", "taskList"] ->
        element
        |> Yex.XmlElement.children()
        |> Enum.with_index(1)
        |> Enum.reject(fn {item, _n} -> hide && list == "taskList" && done?(item) end)
        |> Enum.flat_map(fn {item, n} ->
          [first | rest] = Enum.to_list(Yex.XmlElement.children(item))

          [
            indent <> mark(list, item, n) <> text(first)
            | Enum.flat_map(rest, &lines(&1, depth + 1, hide))
          ]
        end)

      "blockquote" ->
        element |> Yex.XmlElement.children() |> Enum.flat_map(&lines(&1, depth, hide))

      _ ->
        case text(element) do
          "" -> []
          text -> [indent <> text]
        end
    end
  end

  # An item is done once it and every item nested under it are checked, the same rule the editor hides by.
  defp done?(%Yex.XmlElement{} = element) do
    (Yex.XmlElement.get_tag(element) != "taskItem" ||
       Yex.XmlElement.get_attribute(element, "checked")) &&
      element |> Yex.XmlElement.children() |> Enum.all?(&done?/1)
  end

  defp done?(_text), do: true

  defp mark("bulletList", _item, _n), do: "• "
  defp mark("orderedList", _item, n), do: "#{n}. "

  defp mark("taskList", item, _n),
    do: if(Yex.XmlElement.get_attribute(item, "checked"), do: "☑ ", else: "☐ ")

  # The text without its bold and italic marks, which `to_string` would write as tags.
  defp text(element) do
    for %Yex.XmlText{} = text <- Yex.XmlElement.children(element),
        %{insert: insert} when is_binary(insert) <- Yex.XmlText.to_delta(text),
        into: "",
        do: insert
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
