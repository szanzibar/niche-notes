import { TaskItem as TipTapTaskItem } from '@tiptap/extension-list'
import type { Node, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, Plugin, Selection, TextSelection } from '@tiptap/pm/state'
import { Extension, type Editor } from '@tiptap/react'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { dueLabel, nextDue, overdue } from './dates'

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

// Two lists of one type side by side read as one list with a gap, and Indent can't cross the gap, so an edit
// that leaves them touching joins them. Only our own edits, around the cursor: if two devices joined the same
// lists, the second list's lines would appear twice.
export const JoinLists = Extension.create({
  name: 'joinLists',
  addProseMirrorPlugins: () => [
    new Plugin({
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((tr) => tr.docChanged && !tr.getMeta(ySyncPluginKey))) return null
        const { $from } = state.selection
        const tr = state.tr
        for (let depth = $from.depth; depth > 0; depth--) {
          const { type } = $from.node(depth)
          if (!(type.name in ITEM)) continue
          if (state.doc.resolve($from.after(depth)).nodeAfter?.type === type) tr.join(tr.mapping.map($from.after(depth)))
          if (state.doc.resolve($from.before(depth)).nodeBefore?.type === type) tr.join(tr.mapping.map($from.before(depth)))
        }
        return tr.docChanged ? tr : null
      },
    }),
  ],
})

// How long Delete checked shows hidden checked lines before removing them, so you see what goes.
export const LINGER_MS = 800

// Checked lines leave once the note has been this still, so lines ticked in a row leave together and
// nothing moves under the next tap.
const STILL_MS = 2000

// TipTap puts a hidden label with the line's text beside each checkbox. Android keyboards read it as part
// of the line, and it changes with every letter, so they lose their place and stop correcting words.
// The checkbox keeps its aria-label.
export const TaskItem = TipTapTaskItem.extend({
  // A new line split from a dated one starts without a date.
  addAttributes() {
    return {
      ...this.parent?.(),
      due: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-due'),
        renderHTML: ({ due }) => (due ? { 'data-due': due } : {}),
      },
      repeat: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-repeat'),
        renderHTML: ({ repeat }) => (repeat ? { 'data-repeat': repeat } : {}),
      },
    }
  },
  addNodeView() {
    const render = this.parent?.()
    if (!render) return null
    return (props) => {
      const view = render(props)
      const li = view.dom as HTMLElement
      li.querySelector('label > span')?.remove()
      const { editor, getPos } = props
      // The date follows the line's text and opens the date box. Its words come from CSS, for the same reason
      // as the label above.
      const chip = document.createElement('span')
      chip.className = 'due-chip'
      chip.contentEditable = 'false'
      li.append(chip)
      const showDue = (node: Node) => {
        const { due, repeat, checked } = node.attrs
        if (due) chip.dataset.label = `${repeat ? '↻ ' : ''}${dueLabel(due)}`
        else delete chip.dataset.label
        chip.toggleAttribute('data-overdue', Boolean(due) && !checked && overdue(due))
      }
      showDue(props.node)
      chip.addEventListener('mousedown', (e) => e.preventDefault())
      chip.addEventListener('click', () => {
        const pos = getPos()
        if (!editor.isEditable || pos == null) return
        editor.commands.setTextSelection(pos + editor.state.doc.nodeAt(pos)!.firstChild!.nodeSize)
        editor.view.dom.dispatchEvent(new Event('due-date'))
      })
      // A line checked here or on another device lingers until the note is still. Lines checked before the
      // note opened don't.
      const update = view.update!
      view.update = (node, ...rest) => {
        const was = li.dataset.checked === 'true'
        if (!update(node, ...rest)) return false
        if (node.attrs.checked !== was) li.toggleAttribute('data-lingering', node.attrs.checked)
        showDue(node)
        return true
      }
      // The editor would read the lingering mark as an edit to the line.
      view.ignoreMutation = (m) => m.type === 'attributes' && m.attributeName === 'data-lingering'
      // A tick while typing moves the cursor to the end of the ticked line, so the note stays put, and a tick with
      // the keyboard down leaves it down. TipTap's own tick would focus the editor at the old cursor instead.
      const label = li.querySelector('label')!
      label.addEventListener(
        'change',
        (e) => {
          const pos = getPos()
          if (!editor.isEditable || pos == null) return
          e.stopPropagation()
          const line = editor.state.doc.nodeAt(pos)!
          const checked = (e.target as HTMLInputElement).checked
          const repeats = checked && line.attrs.due && line.attrs.repeat
          editor
            .chain()
            .command(({ tr }) => {
              if (editor.isFocused) tr.setSelection(TextSelection.create(tr.doc, pos + line.firstChild!.nodeSize))
              if (!repeats) tr.setNodeMarkup(pos, undefined, { ...line.attrs, checked })
              return true
            })
            .run()
          if (!repeats) return
          // A repeating line shows its tick for a moment, then moves to its next date, unticked.
          setTimeout(() => {
            const at = getPos()
            const current = at == null ? null : editor.state.doc.nodeAt(at)
            if (!current?.attrs.due || !current.attrs.repeat) return
            editor
              .chain()
              .command(({ tr }) => {
                tr.setNodeMarkup(at!, undefined, { ...current.attrs, due: nextDue(current.attrs.due, current.attrs.repeat) })
                return true
              })
              .run()
          }, 600)
        },
        true,
      )
      return view
    }
  },
})

// A line is done once it and every line nested under it are checked. Only a done line hides, with what is
// nested under it, and Delete checked removes only done lines. The server's widget lines follow the same rule.
function done(node: Node) {
  if (node.type.name !== 'taskItem' || !node.attrs.checked) return false
  let open = false
  node.descendants((child) => {
    open ||= child.type.name === 'taskItem' && !child.attrs.checked
    return !open
  })
  return !open
}

// The outermost done line holding `$pos`, as a depth, or 0.
function doneDepth($pos: ResolvedPos) {
  for (let depth = 1; depth <= $pos.depth; depth++) {
    if (done($pos.node(depth))) return depth
  }
  return 0
}

// The nearest place to type from `pos` in direction `dir`, skipping hidden lines.
function visibleFrom(state: EditorState, pos: number, dir: -1 | 1) {
  let found = Selection.findFrom(state.doc.resolve(pos), dir, true)
  while (found) {
    const depth = doneDepth(found.$from)
    if (!depth) return found
    found = Selection.findFrom(state.doc.resolve(dir < 0 ? found.$from.before(depth) : found.$from.after(depth)), dir, true)
  }
  return null
}

// In a note that hides checked lines, the cursor leaves a line as soon as it is done, for the end of the line
// above or the start of the line below, so typing never lands in a hidden line.
export const HideChecked = (hiding: () => boolean) =>
  Extension.create({
    name: 'hideChecked',
    addProseMirrorPlugins: () => [
      new Plugin({
        appendTransaction: (_transactions, _old, state) => {
          const { $from } = state.selection
          const depth = hiding() ? doneDepth($from) : 0
          if (!depth) return null
          const to = visibleFrom(state, $from.before(depth), -1) ?? visibleFrom(state, $from.after(depth), 1)
          return to && state.tr.setSelection(to)
        },
        // A tap, a key, a scroll or an edit from anyone counts as the note moving.
        view: (view) => {
          let timer: number | undefined
          const wait = () => {
            clearTimeout(timer)
            timer = window.setTimeout(() => {
              for (const li of view.dom.querySelectorAll('[data-lingering]')) li.removeAttribute('data-lingering')
            }, STILL_MS)
          }
          const events = ['pointerdown', 'keydown', 'scroll']
          for (const type of events) document.addEventListener(type, wait, true)
          return {
            update: wait,
            destroy: () => {
              clearTimeout(timer)
              for (const type of events) document.removeEventListener(type, wait, true)
            },
          }
        },
      }),
    ],
  })

// One step, so Undo brings them all back. Going from the end keeps the earlier positions valid, and
// deleteRange takes a list along with its last line.
export function deleteChecked(editor: Editor) {
  const lines: [number, number][] = []
  editor.state.doc.descendants((node, pos) => {
    if (!done(node)) return
    lines.push([pos, pos + node.nodeSize])
    return false
  })
  editor
    .chain()
    .command(({ tr }) => {
      for (const [from, to] of lines.reverse()) tr.deleteRange(from, to)
      return true
    })
    .run()
}

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
