import { TaskItem as TipTapTaskItem } from '@tiptap/extension-list'
import type { Node, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, NodeSelection, Plugin, Selection, TextSelection } from '@tiptap/pm/state'
import { Transform } from '@tiptap/pm/transform'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { Extension, type Editor } from '@tiptap/react'
import { prosemirrorToYXmlFragment, yXmlFragmentToProseMirrorRootNode, ySyncPluginKey } from '@tiptap/y-tiptap'
import { openDoc } from '../sync/store'
import { dueLabel, nextDue, overdue, parseRule } from './dates'
import { GRIP } from './icons'

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

// A finger never starts the browser's own drag, so a touch on a grip plays the drag events the editor moves lines
// with, and a touch that doesn't move is a tap. Dragging past the visible part of a long note doesn't scroll it.
export function dragByTouch(grip: HTMLElement | null, onTap?: () => void) {
  if (!grip) return
  const start = (down: TouchEvent) => {
    down.preventDefault()
    const dataTransfer = new DataTransfer()
    let at = down.touches[0]
    let dragging = false
    const fire = (type: string, target: Element | null) =>
      target?.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: at.clientX, clientY: at.clientY }),
      )
    const move = (e: TouchEvent) => {
      e.preventDefault()
      if (!dragging) fire('dragstart', grip)
      dragging = true
      at = e.touches[0]
      fire('dragover', document.elementFromPoint(at.clientX, at.clientY))
    }
    const end = (e: TouchEvent) => {
      if (dragging) {
        if (e.type === 'touchend') fire('drop', document.elementFromPoint(at.clientX, at.clientY))
        fire('dragend', grip)
      } else if (e.type === 'touchend') onTap?.()
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
    document.addEventListener('touchcancel', end)
  }
  grip.addEventListener('touchstart', start, { passive: false })
  return () => grip.removeEventListener('touchstart', start)
}

// Moves a list line, with what is nested under it, to the end of another note: into the list there when that note
// ends in the same kind of list, otherwise in a list of its own.
export async function moveLine(editor: Editor, line: () => number | undefined, from: string, to: string) {
  if (to === from) return
  const target = (await openDoc(to)).getXmlFragment('content')
  const pos = line()
  if (pos == null) return
  const { doc, schema } = editor.state
  const node = doc.nodeAt(pos)!
  const list = doc.resolve(pos).parent
  const there = yXmlFragmentToProseMirrorRootNode(target, schema)
  const tr = new Transform(there)
  // The editor keeps an empty line after a list, which isn't where the note's text ends.
  let end = there.content.size
  let last = there.lastChild
  if (last?.isTextblock && !last.content.size && there.childCount > 1) {
    end -= last.nodeSize
    last = there.child(there.childCount - 2)
  }
  if (last?.type === list.type) tr.insert(end - 1, node)
  else tr.insert(end, list.type.create(list.attrs, node))
  prosemirrorToYXmlFragment(tr.doc, target)
  editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize })
}

// The line a grip is dragging: where it is, and how a note in the tree takes it.
let dragged: { line: () => number | undefined; moveTo: (note: string) => void } | null = null
export const draggedLine = () => dragged?.moveTo

const isLine = (node: Node) => node.type.name === 'taskItem' || node.type.name === 'listItem'

// Whether a node is a list or sits in one, so the floating handle can leave list lines to their grips.
export function inList(doc: Node, pos: number) {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) if (isLine($pos.node(depth))) return true
  const node = doc.nodeAt(pos)
  return node != null && (isLine(node) || node.type.name in ITEM)
}

interface Drop {
  pos: number
  zone: 'before' | 'after' | 'inside'
  top: number
  left: number
}

// Like a note in the tree, a dragged line lands above the line under the pointer from the top of its row, below it
// from the bottom, and as its first child from the middle. Below the middle of a row with lines nested under it is
// its first child too, since that is where the drop shows. Null over the dragged line, undefined off every line.
function dropAt(view: EditorView, y: number, from: number): Drop | null | undefined {
  const end = from + view.state.doc.nodeAt(from)!.nodeSize
  let found: Drop | null | undefined
  view.state.doc.descendants((node, pos) => {
    if (found !== undefined) return false
    if (!isLine(node)) return
    const li = view.nodeDOM(pos) as HTMLElement
    const row = li.getBoundingClientRect()
    const nested = li.querySelector(':scope > div > :is(ul, ol), :scope > :is(ul, ol)')
    const bottom = nested ? nested.getBoundingClientRect().top : row.bottom
    if (y < row.top || y >= bottom) return
    if (pos >= from && pos < end) found = null
    else {
      const at = (y - row.top) / (bottom - row.top)
      const zone = at < 0.3 ? 'before' : at > 0.7 && !nested ? 'after' : 'inside'
      found = { pos, zone, top: zone === 'before' ? row.top : bottom, left: row.left }
    }
    return false
  })
  return found
}

// One step, so Undo puts the line back. A line takes the kind of the list it lands in.
function dropLine(view: EditorView, from: number, { pos, zone }: Drop) {
  const { doc, schema, tr } = view.state
  const line = doc.nodeAt(from)!
  const target = doc.nodeAt(pos)!
  const nested = target.childCount > 1 && target.child(1).type.name in ITEM ? target.child(1) : null
  const list = zone !== 'inside' ? doc.resolve(pos).parent.type : nested?.type
  const at =
    zone === 'before'
      ? pos
      : zone === 'after'
        ? pos + target.nodeSize
        : pos + 1 + target.firstChild!.nodeSize + (nested ? 1 : 0)
  if (at === from || at === from + line.nodeSize) return
  const kind = list && schema.nodes[ITEM[list.name as ListType]]
  const item = !kind || kind === line.type ? line : kind.create(null, line.content)
  // A first child goes in a new list of the line's own kind.
  tr.insert(at, list ? item : doc.resolve(from).parent.type.create(null, item))
  tr.deleteRange(tr.mapping.map(from), tr.mapping.map(from + line.nodeSize, -1))
  view.dispatch(tr)
}

// Every list line has a grip in the margin, shown all the time on a touch screen and for the line under the pointer
// otherwise. Dragging it moves the line with what is nested under it, with a mark where it will land, and a tap asks
// which note to move it to.
export const LineGrips = (note: string) =>
  Extension.create({
    name: 'lineGrips',
    addProseMirrorPlugins() {
      const { editor } = this
      const mark = document.createElement('div')
      mark.className = 'line-drop'
      mark.hidden = true
      const show = (drop: Drop | null | undefined) => {
        mark.hidden = !drop
        if (!drop) return
        const box = mark.parentElement!.getBoundingClientRect()
        mark.style.top = `${drop.top - box.top + mark.parentElement!.scrollTop}px`
        mark.style.left = `${drop.left - box.left}px`
        mark.toggleAttribute('data-inside', drop.zone === 'inside')
      }
      const target = (view: EditorView, e: DragEvent) => {
        const from = dragged?.line()
        return from == null ? null : dropAt(view, e.clientY, from)
      }
      const grip = (view: EditorView, getPos: () => number | undefined) => {
        const el = document.createElement('span')
        el.className = 'line-grip'
        el.contentEditable = 'false'
        el.draggable = true
        el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="${GRIP}"/></svg>`
        // The grip sits at the start of its line's content.
        const line = () => {
          const pos = getPos()
          return pos == null ? undefined : pos - 1
        }
        const ask = () => view.dom.dispatchEvent(new CustomEvent('move-line', { detail: line }))
        el.addEventListener('click', ask)
        dragByTouch(el, ask)
        // The editor drags whatever is selected, so the line becomes the selection.
        el.addEventListener('dragstart', (e) => {
          const at = line()
          if (at == null) return
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)))
          e.dataTransfer?.setDragImage(el.closest('li')!, 0, 0)
          dragged = { line, moveTo: (to) => void moveLine(editor, line, note, to) }
        })
        el.addEventListener('dragend', () => {
          dragged = null
          show(null)
        })
        return el
      }
      return [
        new Plugin({
          view: (view) => {
            view.dom.parentElement!.append(mark)
            return { destroy: () => mark.remove() }
          },
          props: {
            decorations: (state) => {
              const grips: Decoration[] = []
              state.doc.descendants((node, pos) => {
                if (!isLine(node)) return
                grips.push(
                  Decoration.widget(pos + 1, grip, {
                    side: -1,
                    key: 'grip',
                    ignoreSelection: true,
                    // Drag events reach the editor, which moves the line, and so does a drop on another grip.
                    stopEvent: (e) => !(e instanceof DragEvent),
                  }),
                )
              })
              return DecorationSet.create(state.doc, grips)
            },
            // Off every list line, the editor places the line as it would anything else.
            handleDOMEvents: {
              dragover: (view, e) => {
                if (!dragged) return false
                const drop = target(view, e)
                show(drop)
                if (drop === undefined) return false
                e.preventDefault()
                return true
              },
              dragleave: (view, e) => {
                if (!view.dom.contains(e.relatedTarget as globalThis.Node | null)) show(null)
                return false
              },
            },
            handleDrop: (view, e) => {
              if (!dragged) return false
              const drop = target(view, e)
              show(null)
              if (drop === undefined) return false
              if (drop) dropLine(view, dragged.line()!, drop)
              return true
            },
          },
        }),
      ]
    },
  })

// Checked lines leave once the note has been this still, so lines ticked in a row leave together and
// nothing moves under the next tap.
const STILL_MS = 5000

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
      // Minutes, for a line with a time.
      duration: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => Number(el.getAttribute('data-duration')) || null,
        renderHTML: ({ duration }) => (duration ? { 'data-duration': duration } : {}),
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
        if (due) chip.dataset.label = `${parseRule(repeat) ? '↻ ' : ''}${dueLabel(due)}`
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
      // The space after the date belongs to the line, not its text, and a phone puts the cursor on the next
      // line for a tap there. It goes to the end of the tapped row instead.
      li.addEventListener('click', (e) => {
        if (e.target !== li || !editor.isEditable) return
        const text = li.querySelector(':scope > div > p')!.getBoundingClientRect()
        const at = editor.view.posAtCoords({ left: text.right - 1, top: e.clientY })
        if (at) editor.commands.focus(at.pos)
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
          const repeats = checked && line.attrs.due && parseRule(line.attrs.repeat)
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
// nested under it, and only done lines are deleted. The server's widget lines follow the same rule.
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
