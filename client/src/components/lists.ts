import { TaskItem as TipTapTaskItem } from '@tiptap/extension-list'
import type { Node, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, Plugin, Selection } from '@tiptap/pm/state'
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

// TipTap puts a hidden label with the line's text beside each checkbox. Android keyboards read it as part
// of the line, and it changes with every letter, so they lose their place and stop correcting words.
// The checkbox keeps its aria-label.
export const TaskItem = TipTapTaskItem.extend({
  addNodeView() {
    const render = this.parent?.()
    if (!render) return null
    return (props) => {
      const view = render(props)
      ;(view.dom as HTMLElement).querySelector('label > span')?.remove()
      return view
    }
  },
})

// The outermost checked line holding `$pos`, as a depth, or 0. A checked line hides what is nested under it.
function checkedDepth($pos: ResolvedPos) {
  for (let depth = 1; depth <= $pos.depth; depth++) {
    const node = $pos.node(depth)
    if (node.type.name === 'taskItem' && node.attrs.checked) return depth
  }
  return 0
}

// The nearest place to type from `pos` in direction `dir`, skipping checked lines.
function visibleFrom(state: EditorState, pos: number, dir: -1 | 1) {
  let found = Selection.findFrom(state.doc.resolve(pos), dir, true)
  while (found) {
    const depth = checkedDepth(found.$from)
    if (!depth) return found
    found = Selection.findFrom(state.doc.resolve(dir < 0 ? found.$from.before(depth) : found.$from.after(depth)), dir, true)
  }
  return null
}

// In a note that hides checked lines, a line hides the moment it is checked, so the cursor leaves it for
// the end of the line above, or the start of the line below, and typing never lands in a hidden line.
export const HideChecked = (hiding: () => boolean) =>
  Extension.create({
    name: 'hideChecked',
    addProseMirrorPlugins: () => [
      new Plugin({
        appendTransaction: (_transactions, _old, state) => {
          const { $from } = state.selection
          const depth = hiding() ? checkedDepth($from) : 0
          if (!depth) return null
          const to = visibleFrom(state, $from.before(depth), -1) ?? visibleFrom(state, $from.after(depth), 1)
          return to && state.tr.setSelection(to)
        },
      }),
    ],
  })

// One step, so Undo checks them all again.
export function uncheckAll(editor: Editor) {
  editor
    .chain()
    .command(({ tr }) => {
      tr.doc.descendants((node, pos) => {
        if (node.type.name === 'taskItem' && node.attrs.checked) tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false })
      })
      return true
    })
    .run()
}
