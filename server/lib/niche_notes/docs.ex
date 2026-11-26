defmodule NicheNotes.Docs do
  @moduledoc """
  Y.js documents as update logs. A doc is a user's tree (id == owner_id) or a note.
  The server stores who owns what and who it is shared with. It reads a note only for work that
  has to happen while every app is closed, such as a home-screen widget, an alert or a calendar.
  """
  import Ecto.Query
  alias NicheNotes.{Reminders, Repo}
  alias NicheNotes.Accounts.User
  alias NicheNotes.Docs.{Doc, DocLink, DocShare, DocUpdate}

  # What a join does. The first join of an unknown id creates the doc, which is how a note written offline
  # reaches the server. The log is folded before the join reads it.
  def open(doc_id, user_id) do
    with {:ok, _} <- Ecto.UUID.cast(doc_id),
         %Doc{owner_id: owner_id} <- Repo.get(Doc, doc_id) || create(doc_id, user_id),
         true <- owner_id == user_id or shared_with?(doc_id, user_id) do
      fold(doc_id)
      {:ok, owner_id}
    else
      _ -> :forbidden
    end
  end

  # A guest has only the notes a link let them into.
  defp create(doc_id, user_id) do
    if not User.guest?(Repo.get!(User, user_id)) do
      Repo.insert!(%Doc{id: doc_id, owner_id: user_id}, on_conflict: :nothing)
      Repo.get(Doc, doc_id)
    end
  end

  def can_access?(doc_id, user_id) do
    Repo.exists?(from d in Doc, where: d.id == ^doc_id and d.owner_id == ^user_id) or
      shared_with?(doc_id, user_id)
  end

  # A share can be to read only, and the owner can always edit.
  def can_edit?(doc_id, user_id) do
    Repo.exists?(from d in Doc, where: d.id == ^doc_id and d.owner_id == ^user_id) or
      Repo.exists?(
        from s in DocShare,
          where: s.doc_id == ^doc_id and s.user_id == ^user_id and not s.read_only
      )
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

  # Every row with its time, from which a device builds each version of the note itself.
  def history(doc_id) do
    Repo.all(
      from u in DocUpdate,
        where: u.doc_id == ^doc_id,
        order_by: u.id,
        select: {u.id, u.inserted_at, u.update}
    )
  end

  # By a row's age: one row per minute for 20 minutes, per 10 minutes to a day, per hour to two days, per UTC day to
  # two weeks, and one row before that. An active note keeps at most about 20 + 144 + 24 + 12 + 1 ≈ 200 rows.
  # A row takes its bucket's last id and newest time, so a device's `since` keeps meaning "I hold everything up to here"
  # and the row stays in its bucket. A plain merge, since rebuilding the doc drops an edit that waits on a row the log
  # lacks. Deleted text stays.
  def fold(doc_id, now \\ DateTime.utc_now()) do
    now = DateTime.to_unix(now)

    rows =
      from u in DocUpdate,
        where: u.doc_id == ^doc_id,
        select: %{
          id: u.id,
          at: u.inserted_at,
          update: u.update,
          bucket:
            fragment(
              """
              CASE
                WHEN ? - unixepoch(?) < 1200 THEN 'minute ' || (unixepoch(?) / 60)
                WHEN ? - unixepoch(?) < 86400 THEN '10 minutes ' || (unixepoch(?) / 600)
                WHEN ? - unixepoch(?) < 172800 THEN 'hour ' || (unixepoch(?) / 3600)
                WHEN ? - unixepoch(?) < 1209600 THEN 'day ' || (unixepoch(?) / 86400)
                ELSE 'base'
              END
              """,
              ^now,
              u.inserted_at,
              u.inserted_at,
              ^now,
              u.inserted_at,
              u.inserted_at,
              ^now,
              u.inserted_at,
              u.inserted_at,
              ^now,
              u.inserted_at,
              u.inserted_at
            )
        }

    full = from r in subquery(rows), group_by: r.bucket, having: count() > 1, select: r.bucket
    folded = Repo.all(from r in subquery(rows), where: r.bucket in subquery(full), order_by: r.id)

    Repo.transaction(fn ->
      for {_bucket, rows} <- Enum.group_by(folded, & &1.bucket),
          {:ok, update} <- [merge(Enum.map(rows, & &1.update))] do
        last = List.last(rows)
        Repo.delete_all(from u in DocUpdate, where: u.id in ^Enum.map(rows, & &1.id))

        Repo.insert_all(DocUpdate, [
          %{id: last.id, doc_id: doc_id, update: update, inserted_at: last.at}
        ])
      end
    end)
  end

  # A log from before the server stored each update once can hold one several times, and merging enough copies
  # crashes the Y.js library.
  defp merge(updates), do: Yex.merge_updates(Enum.uniq(updates))

  # What the log holds, for someone checking a restored backup: each person's notes, and the notes edited last.
  def summary do
    people = for u <- Repo.all(User), do: "#{u.name}: #{length(note_ids(u.id))} notes"

    newest =
      Repo.all(
        from u in DocUpdate,
          join: d in assoc(u, :doc),
          where: d.id != d.owner_id,
          group_by: u.doc_id,
          order_by: [desc: max(u.id)],
          limit: 5,
          select: {u.doc_id, max(u.inserted_at)}
      )

    edited = for {id, at} <- newest, do: "#{at}  #{title(id)}"
    Enum.join(people ++ ["Edited last:"] ++ edited, "\n")
  end

  # What a widget shows, under a header in the color the app gives it: the user's notes as their tree draws them, or
  # one note's lines with blank lines kept except at either end. A note the user can no longer open, or that is in
  # the trash, is gone.
  def widget(user_id, user_id) do
    {nodes, _settings} = tree = tree(user_id)
    children = Enum.group_by(nodes, fn {_id, node} -> node["parent"] end)
    rows = tree_rows(children, MapSet.new(note_ids(user_id)), nil, 0, false)
    {:ok, Map.merge(%{title: "Notes", rows: rows}, theme(tree, nil))}
  end

  def widget(doc_id, user_id) do
    with true <- can_access?(doc_id, user_id),
         {_doc, title, meta, content} <- load(doc_id) do
      hide = meta["hideChecked"] == true or meta["deleteChecked"] == true
      blank? = &(String.trim(&1.line) == "")

      rows =
        content
        |> Enum.flat_map(&lines(&1, 0, hide))
        |> Enum.drop_while(blank?)
        |> Enum.reverse()
        |> Enum.drop_while(blank?)
        |> Enum.reverse()

      {:ok, Map.merge(%{title: title, rows: rows}, theme(tree(user_id), doc_id))}
    else
      _ -> :error
    end
  end

  # What a Due widget shows, under the user's own color: every unchecked dated line in the notes outside their trash,
  # the earliest first, as the app's Due list has them, and the sections it has folded. A repeating line says where
  # ticking it moves it from the phone's `today`. The text is cut like an alert's, since Done finds its line by that.
  def due_widget(user_id, today) do
    {nodes, settings} = tree = tree(user_id)

    rows =
      for {id, {title, lines}} <- Reminders.notes_for(user_id),
          nodes[id]["leftAt"] == nil,
          line <- lines do
        %{
          note: id,
          title: title,
          text: String.slice(line.text, 0, 200),
          due: line.due,
          next: Reminders.next_due(line, today)
        }
      end

    Map.merge(
      %{rows: Enum.sort_by(rows, & &1.due), collapsed: settings["dueCollapsed"] || []},
      theme(tree, nil)
    )
  end

  # A Due widget folding a section, in the setting the app's Due list folds by, so both stay folded together.
  def collapse_due(user_id, section, collapsed) do
    {doc, _meta} = read(user_id)
    settings = Yex.Doc.get_map(doc, "settings")
    folded = List.delete(Yex.Map.to_map(settings)["dueCollapsed"] || [], section)
    {:ok, before} = Yex.encode_state_vector(doc)
    Yex.Map.set(settings, "dueCollapsed", if(collapsed, do: folded ++ [section], else: folded))
    {:ok, update} = Yex.encode_state_as_update(doc, before)
    {append_update(user_id, update), update}
  end

  defp tree(user_id) do
    doc = Yex.Doc.new()
    updates = from u in DocUpdate, where: u.doc_id == ^user_id, order_by: u.id, select: u.update
    {:ok, update} = merge(Repo.all(updates))
    :ok = Yex.apply_update(doc, update)

    {doc |> Yex.Doc.get_map("nodes") |> Yex.Map.to_map(),
     doc |> Yex.Doc.get_map("settings") |> Yex.Map.to_map()}
  end

  # Pinned first, then newest, and only the pinned notes under a folded note. Each row loads its note for the title,
  # about 0.15 ms, so 10,000 unfolded notes take a second or two.
  defp tree_rows(children, notes, parent, depth, folded) do
    children
    |> Map.get(parent, [])
    |> Enum.filter(fn {id, node} ->
      MapSet.member?(notes, id) and node["leftAt"] == nil and
        (not folded or node["pinned"] == true)
    end)
    |> Enum.sort_by(fn {_id, node} -> {node["pinned"] != true, -(node["order"] || 0)} end)
    |> Enum.flat_map(fn {id, node} ->
      case load(id) do
        nil ->
          []

        {_doc, title, _meta, _content} ->
          under = tree_rows(children, notes, id, depth + 1, node["collapsed"] == true)
          [%{line: title, depth: depth, note: id} | under]
      end
    end)
  end

  # The themes in client/src/components/themes.ts, in the same order, since Confetti picks one by position.
  @themes [
    {"#FF4F3B", "#FFFFFF"},
    {"#2F6BFF", "#FFFFFF"},
    {"#1A9E5C", "#FFFFFF"},
    {"#8B3DFF", "#FFFFFF"},
    {"#E8700A", "#FFFFFF"},
    {"#E0338A", "#FFFFFF"},
    {"#0E9494", "#FFFFFF"},
    {"#FF9F85", "#111111"},
    {"#6CC6FF", "#111111"},
    {"#B5E853", "#111111"},
    {"#C3A3FF", "#111111"},
    {"#FFD23F", "#111111"},
    {"#FF8AD0", "#111111"},
    {"#5FE0BF", "#111111"}
  ]

  # The note's color and the text on it, as the app's `noteTheme` and `appTheme` pick them for this user. The tree
  # wears the user's own theme.
  defp theme({nodes, settings}, doc_id) do
    {color, ink} =
      List.keyfind(@themes, nodes[doc_id]["color"], 0) ||
        (doc_id && settings["scheme"] == "confetti" && confetti(doc_id)) ||
        List.keyfind(@themes, settings["accent"], 0) || hd(@themes)

    %{color: color, ink: ink}
  end

  # The same 32-bit string hash the app picks by.
  defp confetti(id) do
    hash =
      for <<c <- id>>, reduce: 0 do
        h ->
          <<h::signed-32>> = <<h * 31 + c::32>>
          h
      end

    Enum.at(@themes, rem(abs(hash), length(@themes)))
  end

  def title(doc_id) do
    case load(doc_id) do
      {_doc, title, _meta, _content} -> title
      nil -> "Untitled"
    end
  end

  # A note's title and its unchecked checkbox lines that have a date, at any depth. A note in the trash has none.
  def dated_lines(doc_id) do
    case load(doc_id) do
      {_doc, title, _meta, content} -> {title, Enum.flat_map(content, &dated/1)}
      nil -> {nil, []}
    end
  end

  # An alert's button changing its line while the app may be closed: `changes` sets `checked` or a new `due`. The
  # line is the first unchecked one with that date and text, so one edited since the alert is left alone.
  def change_line(doc_id, user_id, due, text, changes) do
    with true <- can_edit?(doc_id, user_id),
         {doc, _title, _meta, content} <- load(doc_id),
         %Yex.XmlElement{} = line <- Enum.find_value(content, &find_line(&1, due, text)),
         {:ok, before} <- Yex.encode_state_vector(doc) do
      for {key, value} <- changes, do: Yex.XmlElement.insert_attribute(line, key, value)
      {:ok, update} = Yex.encode_state_as_update(doc, before)
      {:ok, append_update(doc_id, update), update}
    else
      _ -> :error
    end
  end

  # The tasks someone assigned to another person, each once, since reading them removes `assignedBy`. One assigned
  # offline arrives with it. Known and accepted: reassigning on a device that hasn't heard of the removal writes no
  # new `assignedBy`, so that assignee isn't alerted.
  def take_assignments(doc_id) do
    with {doc, title, _meta, content} <- load(doc_id),
         [_ | _] = found <- Enum.flat_map(content, &assigned/1),
         {:ok, before} <- Yex.encode_state_vector(doc) do
      for {line, _assignment} <- found, do: Yex.XmlElement.remove_attribute(line, "assignedBy")
      {:ok, update} = Yex.encode_state_as_update(doc, before)
      stored = append_update(doc_id, update)

      NicheNotesWeb.Endpoint.broadcast!("doc:#{doc_id}", "update", %{
        seq: stored.id,
        update: Base.encode64(update)
      })

      for {_line, assignment} <- found, do: Map.put(assignment, :title, title)
    else
      _ -> []
    end
  end

  defp assigned(%Yex.XmlElement{} = element) do
    children = Enum.to_list(Yex.XmlElement.children(element))
    nested = Enum.flat_map(children, &assigned/1)
    attribute = &Yex.XmlElement.get_attribute(element, &1)

    with "taskItem" <- Yex.XmlElement.get_tag(element),
         [%Yex.XmlElement{} = first | _] <- children,
         by when is_binary(by) <- attribute.("assignedBy"),
         assignee when is_binary(assignee) <- attribute.("assignee") do
      [{element, %{assignee: assignee, by: by, text: text(first)}} | nested]
    else
      _ -> nested
    end
  end

  defp assigned(_text), do: []

  # Alerts carry a line's text cut to 200 letters.
  defp find_line(%Yex.XmlElement{} = element, due, text) do
    children = Enum.to_list(Yex.XmlElement.children(element))

    with "taskItem" <- Yex.XmlElement.get_tag(element),
         ^due <- Yex.XmlElement.get_attribute(element, "due"),
         false <- Yex.XmlElement.get_attribute(element, "checked") == true,
         [%Yex.XmlElement{} = first | _] <- children,
         true <- String.slice(text(first), 0, 200) == text do
      element
    else
      _ -> Enum.find_value(children, &find_line(&1, due, text))
    end
  end

  defp find_line(_text, _due, _line_text), do: nil

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

  # The notes this user can open that have rows after `seen`, and the newest of those rows.
  def changed_for(user_id, seen) do
    rows =
      Repo.all(
        from u in DocUpdate,
          join: d in assoc(u, :doc),
          left_join: s in DocShare,
          on: s.doc_id == d.id and s.user_id == ^user_id,
          where:
            u.id > ^seen and d.id != d.owner_id and
              (d.owner_id == ^user_id or s.user_id == ^user_id),
          group_by: u.doc_id,
          select: {u.doc_id, max(u.id)}
      )

    {Enum.map(rows, &elem(&1, 0)), rows |> Enum.map(&elem(&1, 1)) |> Enum.max(fn -> seen end)}
  end

  # Of these notes, the ones this user can open, with their owners. Unlike a join, an unknown id stays unknown.
  def owners(doc_ids, user_id) do
    Repo.all(
      from d in Doc,
        left_join: s in DocShare,
        on: s.doc_id == d.id and s.user_id == ^user_id,
        where:
          d.id in ^doc_ids and d.id != d.owner_id and
            (d.owner_id == ^user_id or s.user_id == ^user_id),
        select: {d.id, d.owner_id}
    )
    |> Map.new()
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

  # A doc rebuilt from its log, with its meta map.
  defp read(doc_id) do
    doc = Yex.Doc.new()
    updates = from u in DocUpdate, where: u.doc_id == ^doc_id, order_by: u.id, select: u.update

    with {:ok, update} <- merge(Repo.all(updates)),
         :ok <- Yex.apply_update(doc, update) do
      {doc, doc |> Yex.Doc.get_map("meta") |> Yex.Map.to_map()}
    else
      _ -> nil
    end
  end

  # A note in the trash reads as gone.
  defp load(doc_id) do
    with {doc, meta} <- read(doc_id),
         false <- Map.get(meta, "deleted", false) do
      title = if meta["title"] in [nil, ""], do: "Untitled", else: meta["title"]
      {doc, title, meta, doc |> Yex.Doc.get_xml_fragment("content") |> Yex.XmlFragment.children()}
    else
      _ -> nil
    end
  end

  # The repeat rules the date box writes, which a calendar reads as they are.
  @repeat ~r/^FREQ=(WEEKLY|MONTHLY|YEARLY)(;INTERVAL=[1-9]\d*)?(;BYDAY=(-1|[1-4])?(SU|MO|TU|WE|TH|FR|SA)(,(-1|[1-4])?(SU|MO|TU|WE|TH|FR|SA))*|;BYMONTHDAY=([1-9]|[12]\d|3[01]))?$/

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
        if is_binary(attribute.("repeat")) and attribute.("repeat") =~ @repeat,
          do: attribute.("repeat")

      # Minutes, up to a day.
      duration =
        with minutes when is_number(minutes) and minutes >= 1 and minutes <= 1440 <-
               attribute.("duration"),
             do: round(minutes),
             else: (_ -> nil)

      assignee = if is_binary(attribute.("assignee")), do: attribute.("assignee")

      [
        %{
          text: text(first),
          due: due,
          date: date,
          time: time,
          repeat: repeat,
          duration: duration,
          assignee: assignee
        }
        | nested
      ]
    else
      _ -> nested
    end
  end

  defp dated(_text), do: []

  # One row per paragraph, heading, list item or table row: what it shows, its own text, which a tap on it opens the
  # note at, and how deep it is nested. A checkbox item says whether it is checked, and a heading its level. A note
  # that hides or deletes its checked items leaves out each one that is done, with what is nested under it.
  defp lines(element, depth, hide) do
    case Yex.XmlElement.get_tag(element) do
      list when list in ["bulletList", "orderedList", "taskList"] ->
        element
        |> Yex.XmlElement.children()
        |> Enum.with_index(1)
        |> Enum.reject(fn {item, _n} -> hide && list == "taskList" && done?(item) end)
        |> Enum.flat_map(fn {item, n} ->
          [first | rest] = Enum.to_list(Yex.XmlElement.children(item))
          row = %{line: mark(list, n) <> text(first), text: text(first), depth: depth}

          row =
            if list == "taskList",
              do: Map.put(row, :checked, Yex.XmlElement.get_attribute(item, "checked") == true),
              else: row

          [row | Enum.flat_map(rest, &lines(&1, depth + 1, hide))]
        end)

      "blockquote" ->
        element |> Yex.XmlElement.children() |> Enum.flat_map(&lines(&1, depth, hide))

      "table" ->
        for row <- Yex.XmlElement.children(element) do
          cells =
            for cell <- Yex.XmlElement.children(row),
                do: cell |> Yex.XmlElement.children() |> Enum.map_join(" ", &text/1)

          line = Enum.join(cells, " | ")
          %{line: line, text: line, depth: depth}
        end

      "heading" ->
        level = element |> Yex.XmlElement.get_attribute("level") |> trunc()
        [%{line: text(element), text: text(element), depth: depth, heading: level}]

      _ ->
        [%{line: text(element), text: text(element), depth: depth}]
    end
  end

  # An item is done once it and every item nested under it are checked, the same rule the editor hides by.
  defp done?(%Yex.XmlElement{} = element) do
    (Yex.XmlElement.get_tag(element) != "taskItem" ||
       Yex.XmlElement.get_attribute(element, "checked")) &&
      element |> Yex.XmlElement.children() |> Enum.all?(&done?/1)
  end

  defp done?(_text), do: true

  # A widget draws a checkbox item's box itself.
  defp mark("bulletList", _n), do: "• "
  defp mark("orderedList", n), do: "#{n}. "
  defp mark("taskList", _n), do: ""

  # The text without its bold and italic marks, which `to_string` would write as tags.
  defp text(element) do
    for %Yex.XmlText{} = text <- Yex.XmlElement.children(element),
        %{insert: insert} when is_binary(insert) <- Yex.XmlText.to_delta(text),
        into: "",
        do: insert
  end

  # The notes whose place a tree update writes without having seen the place their person gave them: under a note,
  # pinned, colored, folded or left. Only a device whose tree is behind writes that, and Y.js may keep its place over
  # the real one. An update's items show only in y_ex's debug text, whose wording the test holds. Reading the tree
  # takes a few milliseconds at family scale, and only an update that places a note asks for it.
  def unseen_places(doc_id, update) do
    placed = fn update ->
      with {:ok, text} <- Yex.update_debug_v1(update) do
        List.flatten(Regex.scan(~r/parent: nodes, '([^']+)' =>/, text, capture: :all_but_first))
      else
        _ -> []
      end
    end

    with [_ | _] <- placed.(update),
         {doc, _meta} <- read(doc_id),
         {:ok, seen} <- Yex.encode_state_vector(doc),
         {:ok, new} <- Yex.diff_update(update, seen) do
      nodes = doc |> Yex.Doc.get_map("nodes") |> Yex.Map.to_map()

      for id <- placed.(new),
          node = nodes[id],
          Enum.any?(~w(parent pinned collapsed color leftAt), &node[&1]),
          do: id
    else
      _ -> []
    end
  end

  # The row that already holds this update. After a restore or a crash every device sends its notes again, and the
  # log still has most of them. Known and accepted: two devices sending one at the same moment both store it.
  def held_seq(doc_id, update) do
    Repo.one(
      from u in DocUpdate, where: u.doc_id == ^doc_id and u.update == ^update, select: min(u.id)
    )
  end

  # Each member's devices hear of it, so one that doesn't have the note open can pull it.
  def append_update(doc_id, update) do
    stored = Repo.insert!(%DocUpdate{doc_id: doc_id, update: update})

    for user_id <- member_ids(doc_id),
        do: NicheNotesWeb.Endpoint.broadcast("user:#{user_id}", "changed", %{doc: doc_id})

    stored
  end

  # Everyone on each note, so anyone on it can assign a task to the others.
  def list_shares(user_id) do
    Repo.all(
      from s in DocShare,
        join: d in assoc(s, :doc),
        left_join: mine in DocShare,
        on: mine.doc_id == s.doc_id and mine.user_id == ^user_id,
        where: d.owner_id == ^user_id or not is_nil(mine.user_id),
        select: %{
          doc_id: s.doc_id,
          user_id: s.user_id,
          owner_id: d.owner_id,
          read_only: s.read_only
        }
    )
  end

  # Sharing by name lets them edit, even someone a link let in to read only.
  def share(doc_id, owner_id, user_id) do
    with {:ok, doc} <- owned_note(doc_id, owner_id),
         %User{} <- Repo.get(User, user_id) || {:error, :not_found} do
      Repo.insert(%DocShare{doc_id: doc.id, user_id: user_id},
        on_conflict: [set: [read_only: false]],
        conflict_target: [:doc_id, :user_id]
      )
    end
  end

  # A note's links, the oldest first, each with who came in by it and when.
  def links(doc_id, owner_id) do
    with {:ok, doc} <- owned_note(doc_id, owner_id) do
      visitors =
        Repo.all(
          from s in DocShare,
            join: u in assoc(s, :user),
            where: s.doc_id == ^doc.id and not is_nil(s.link),
            order_by: s.inserted_at,
            select: {s.link, %{name: u.name, at: s.inserted_at}}
        )
        |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))

      links = Repo.all(from l in DocLink, where: l.doc_id == ^doc.id, order_by: l.inserted_at)

      {:ok,
       for link <- links do
         %{
           token: link.token,
           read_only: link.read_only,
           at: link.inserted_at,
           visitors: Map.get(visitors, link.token, [])
         }
       end}
    end
  end

  # The device makes the token, since sharing a link has to happen in the tap that asks for it.
  def create_link(doc_id, owner_id, token, read_only) do
    with {:ok, doc} <- owned_note(doc_id, owner_id),
         true <- token =~ ~r/^[\w-]{16,64}$/ || {:error, :forbidden} do
      Repo.insert!(%DocLink{token: token, doc_id: doc.id, read_only: read_only})
      :ok
    end
  end

  # The guests the link let in go with it. People with an account keep the note, since the owner can see and
  # unshare them by name.
  def delete_link(doc_id, owner_id, token) do
    with {:ok, doc} <- owned_note(doc_id, owner_id) do
      guests =
        from(u in User,
          join: s in DocShare,
          on: s.user_id == u.id,
          where: s.doc_id == ^doc.id and s.link == ^token
        )
        |> Repo.all()
        |> Enum.filter(&User.guest?/1)
        |> Enum.map(& &1.id)

      Repo.delete_all(from s in DocShare, where: s.doc_id == ^doc.id and s.user_id in ^guests)
      Repo.delete_all(from l in DocLink, where: l.doc_id == ^doc.id and l.token == ^token)
      {:ok, guests}
    end
  end

  def by_link(token), do: DocLink |> Repo.get(token) |> Repo.preload(:doc)

  # Opening a link shares its note with whoever opened it. Someone who can edit keeps editing when they open a link
  # to read only, and an edit link lets someone who could only read edit.
  def join(%DocLink{doc: doc} = link, user_id) do
    if doc.owner_id != user_id do
      on_conflict =
        if link.read_only, do: :nothing, else: [set: [read_only: false, link: link.token]]

      Repo.insert!(
        %DocShare{doc_id: doc.id, user_id: user_id, read_only: link.read_only, link: link.token},
        on_conflict: on_conflict,
        conflict_target: [:doc_id, :user_id]
      )
    end

    :ok
  end

  # Deleting a note is a flag inside the doc. This is the trash being emptied: rows gone for good. A device can
  # ask from an old copy, so the note has to be in the trash by the server's own.
  def purge(doc_id, owner_id) do
    with {:ok, doc} <- owned_note(doc_id, owner_id),
         {_doc, %{"deleted" => true}} <- read(doc_id) do
      Repo.delete!(doc)
      :ok
    else
      _ -> {:error, :forbidden}
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
