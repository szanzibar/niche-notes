import type { Node } from '@tiptap/pm/model'
import { Extension, type Editor } from '@tiptap/react'

export type ListType = 'taskList' | 'bulletList' | 'orderedList'
const ITEM: Record<ListType, string> = { taskList: 'taskItem', bulletList: 'listItem', orderedList: 'listItem' }

// Where the cursor is in a list: the item that Indent and Outdent act on, at `depth`, and the list
// whose marker the line carries. A paragraph below an item's first one carries no marker, so `list` is unset.
export function listPosition(editor: Editor): { item?: string; list?: string; depth?: number } {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name
    if (name === 'taskItem' || name === 'listItem') {
      return { item: name, list: $from.index(depth) === 0 ? $from.node(depth - 1).type.name : undefined, depth }
    }
  }
  return {}
}

// Changes the type of the list the line is in and nothing else. TipTap's own toggle would also
// convert every list nested inside it.
export function convertList(editor: Editor, depth: number, type: ListType) {
  const { $from, from, to } = editor.state.selection
  const list = $from.node(depth - 1)
  const pos = $from.before(depth - 1)
  const { nodes } = editor.schema
  const items: Node[] = []
  list.forEach((item) => items.push(nodes[ITEM[type]].create(null, item.content)))
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(pos, pos + list.nodeSize, nodes[type].create(null, items))
      return true
    })
    // Either item type has the same size, so the cursor's positions still hold.
    .setTextSelection({ from, to })
    .run()
}

export function toggleList(editor: Editor, type: ListType) {
  const { item, list, depth } = listPosition(editor)
  // A line below an item's first becomes its own nested list.
  if (item && !list) editor.chain().focus().wrapInList(type).run()
  else if (list && list !== type) convertList(editor, depth!, type)
  // TipTap lifts a line out of its own list type, and wraps a plain line.
  else editor.chain().focus().toggleList(type, ITEM[type]).run()
}

// TipTap's own Tab handlers each indent their own item type, which grabs the parent line when a
// bullet sits inside a checkbox. Ours runs first and indents the line the cursor is on.
export const ListTabs = Extension.create({
  name: 'listTabs',
  priority: 1000,
  addKeyboardShortcuts() {
    const indent = (sink: boolean) => {
      const { item } = listPosition(this.editor)
      if (!item) return false
      if (sink) this.editor.commands.sinkListItem(item)
      else this.editor.commands.liftListItem(item)
      return true
    }
    return { Tab: () => indent(true), 'Shift-Tab': () => indent(false) }
  },
})
