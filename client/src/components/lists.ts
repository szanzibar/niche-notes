import { TaskItem as TipTapTaskItem } from '@tiptap/extension-list'
import type { Node, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { Extension, type Editor } from '@tiptap/react'
import { yUndoPluginKey, ySyncPluginKey } from '@tiptap/y-tiptap'
import type * as Y from 'yjs'
import { enableAlerts } from '../lib/alerts'
import type { User } from '../lib/types'
import { store } from '../sync/store'
import { folds, settings } from '../sync/tree'
import { describeRule, dueLabel, nextDue, overdue, parseDay, parseRule, type Typed, typedDates, withTyped } from './dates'
import { CHEVRON_DOWN, CHEVRON_RIGHT, GRIP } from './icons'

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
  list.forEach((item) => items.push(nodes[ITEM[type]].create(item.attrs.id ? { id: item.attrs.id } : null, item.content)))
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
// bullet sits inside a checkbox. Ours runs first and indents the line the cursor is on. Ctrl or ⌘ and Enter tick
// the task the cursor is on, and Alt+Shift and an arrow move its line past the next line in view.
export const ListKeys = (hiding: () => boolean) =>
  Extension.create({
    name: 'listKeys',
    priority: 1000,
    addKeyboardShortcuts() {
      const indent = (sink: boolean) => {
        const { item } = listPosition(this.editor)
        if (!item) return false
        if (sink) this.editor.commands.sinkListItem(item)
        else this.editor.commands.liftListItem(item)
        return true
      }
      const tick = () => {
        if (!this.editor.isEditable) return false
        const { item, depth } = listPosition(this.editor)
        if (item !== 'taskItem') return false
        const li = this.editor.view.nodeDOM(this.editor.state.selection.$from.before(depth)) as HTMLElement
        li.querySelector<HTMLInputElement>(':scope > label > input')!.click()
        return true
      }
      const move = (dir: -1 | 1) => {
        if (!this.editor.isEditable) return false
        const { item, depth } = listPosition(this.editor)
        if (!item) return false
        const { view, state } = this.editor
        const { $from } = state.selection
        const from = $from.before(depth)
        const list = $from.node(depth! - 1)
        let at = $from.index(depth! - 1) + dir
        while (list.maybeChild(at) && hiding() && done(list.child(at))) at += dir
        const beside = list.maybeChild(at)
        if (!beside) return true
        // A step of its own, so Undo takes back the move and not the typing before it.
        yUndoPluginKey.getState(state)?.undoManager.stopCapturing()
        const pos = $from.posAtIndex(at, depth! - 1)
        const start = dir < 0 ? pos : pos + beside.nodeSize - $from.node(depth).nodeSize
        dropLine(view, from, { pos, zone: dir < 0 ? 'before' : 'after' })
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start + $from.pos - from)).scrollIntoView())
        return true
      }
      return {
        Tab: () => indent(true),
        'Shift-Tab': () => indent(false),
        'Mod-Enter': tick,
        'Alt-Shift-ArrowUp': () => move(-1),
        'Alt-Shift-ArrowDown': () => move(1),
      }
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

// A finger lifts a line by holding its grip this long, so one that moves sooner scrolls the note and one that lets go
// sooner taps.
const HOLD_MS = 300
// A dragging finger this near the top or bottom of the note scrolls it, faster the nearer it gets.
const EDGE = 48
// How quickly a flick on a grip slows down once the finger lets go.
const FLING_MS = 325

// A held grip plays the drag events the editor moves lines with. The grip keeps the whole touch from the browser,
// whose own long press would put the cursor back in the note, vibrate and start a drag of its own, so the grip
// scrolls the note itself.
export function dragByTouch(grip: HTMLElement | null, onTap?: () => void) {
  if (!grip) return
  const start = (down: TouchEvent) => {
    down.preventDefault()
    const dataTransfer = new DataTransfer()
    const first = down.touches[0]
    let at = first
    let dragging = false
    let scrolling = false
    // Pixels a millisecond, from the last move.
    let speed = 0
    let lastY = first.clientY
    let lastAt = down.timeStamp
    const fire = (type: string, target: Element | null) =>
      target?.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: at.clientX, clientY: at.clientY }),
      )
    let scroller = grip.parentElement!
    while (getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement!
    const fling = () => {
      let then = performance.now()
      const step = (now: number) => {
        speed *= Math.exp(-(now - then) / FLING_MS)
        scroller.scrollTop += speed * (now - then)
        then = now
        if (Math.abs(speed) > 0.05) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
      // Any touch stops it, as it stops the browser's own.
      document.addEventListener('touchstart', () => (speed = 0), { once: true, capture: true })
    }
    const scrollNearEdge = () => {
      if (!dragging) return
      const box = scroller.getBoundingClientRect()
      const depth = (gap: number) => Math.min(Math.max(EDGE - gap, 0), EDGE)
      const by = depth(box.bottom - at.clientY) - depth(at.clientY - box.top)
      if (by) {
        scroller.scrollTop += by / 4
        fire('dragover', document.elementFromPoint(at.clientX, at.clientY))
      }
      requestAnimationFrame(scrollNearEdge)
    }
    const lift = setTimeout(() => {
      dragging = true
      fire('dragstart', grip)
      scrollNearEdge()
    }, HOLD_MS)
    const move = (e: TouchEvent) => {
      e.preventDefault()
      at = e.touches[0]
      if (dragging) return fire('dragover', document.elementFromPoint(at.clientX, at.clientY))
      // A finger drifts a few pixels during a tap.
      if (!scrolling && Math.hypot(at.clientX - first.clientX, at.clientY - first.clientY) < 10) return
      scrolling = true
      clearTimeout(lift)
      scroller.scrollTop += lastY - at.clientY
      speed = (lastY - at.clientY) / Math.max(e.timeStamp - lastAt, 1)
      lastY = at.clientY
      lastAt = e.timeStamp
    }
    const end = (e: TouchEvent) => {
      if (dragging) {
        if (e.type === 'touchend') fire('drop', document.elementFromPoint(at.clientX, at.clientY))
        fire('dragend', grip)
      } else if (!scrolling && e.type === 'touchend') onTap?.()
      // A finger that stopped before it let go doesn't flick.
      else if (scrolling && e.timeStamp - lastAt < 50) fling()
      stop()
    }
    const stop = () => {
      dragging = false
      clearTimeout(lift)
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

const isLine = (node: Node) => node.type.name === 'taskItem' || node.type.name === 'listItem'

// Whether a node is a list or sits in one, so the floating handle can leave list lines to their grips.
export function inList(doc: Node, pos: number) {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) if (isLine($pos.node(depth))) return true
  const node = doc.nodeAt(pos)
  return node != null && (isLine(node) || node.type.name in ITEM)
}

interface Row {
  top: number
  bottom: number
  left: number
}
interface Drop {
  pos: number
  zone: 'before' | 'after' | 'inside'
  // Where the mark goes. None into a line with nothing under it yet, where the outline says it all, as in the tree.
  top: number | null
  left: number
  // The line it goes into, none at the top level.
  into: Row | null
}

// A line's own row, without the lines nested under it, from its grip on.
function rowOf(li: Element): Row {
  const box = li.getBoundingClientRect()
  const nested = li.querySelector(':scope > div > :is(ul, ol), :scope > :is(ul, ol)')
  const grip = li.querySelector(':scope > .line-grip, :scope > div > .line-grip') ?? li
  return { top: box.top, bottom: nested ? nested.getBoundingClientRect().top : box.bottom, left: grip.getBoundingClientRect().left }
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
    // A folded line takes a line above or below it, never into the lines it hides.
    const folded = li.hasAttribute('data-folded')
    const nested = folded ? null : li.querySelector(':scope > div > :is(ul, ol), :scope > :is(ul, ol)')
    const bottom = nested ? nested.getBoundingClientRect().top : row.bottom
    if (y < row.top || y >= bottom) return
    if (pos >= from && pos < end) found = null
    else {
      const at = (y - row.top) / (bottom - row.top)
      const zone = folded ? (at < 0.5 ? 'before' : 'after') : at < 0.3 ? 'before' : at > 0.7 && !nested ? 'after' : 'inside'
      const parent = zone === 'inside' ? li : li.parentElement?.closest('li')
      found = {
        pos,
        zone,
        top: zone === 'before' ? row.top : zone === 'inside' && !nested ? null : bottom,
        left: row.left,
        into: parent ? rowOf(parent) : null,
      }
    }
    return false
  })
  return found
}

// One step, so Undo puts the line back. A line takes the kind of the list it lands in.
function dropLine(view: EditorView, from: number, { pos, zone }: Pick<Drop, 'pos' | 'zone'>) {
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
  const item = !kind || kind === line.type ? line : kind.create(line.attrs.id ? { id: line.attrs.id } : null, line.content)
  // A first child goes in a new list of the line's own kind.
  tr.insert(at, list ? item : doc.resolve(from).parent.type.create(null, item))
  tr.deleteRange(tr.mapping.map(from), tr.mapping.map(from + line.nodeSize, -1))
  view.dispatch(tr)
}

const held = new PluginKey<number | null>('heldLine')

// Every list line has a grip in the margin, shown all the time on a touch screen and for the line under the pointer
// otherwise. Dragging it moves the line with what is nested under it. A drag looks like one in the tree: the line
// rides as a box with its text, its place stays dimmed, the line it goes into is outlined, and a mark shows where it
// will land.
export const LineGrips = Extension.create({
  name: 'lineGrips',
  addProseMirrorPlugins() {
    // The line a grip is dragging: where it is.
    let dragged: (() => number | undefined) | null = null
    const mark = document.createElement('div')
    mark.className = 'line-drop'
    mark.hidden = true
    const into = document.createElement('div')
    into.className = 'line-into'
    into.hidden = true
    // The same box as a note dragged in the tree.
    const ghost = document.createElement('div')
    ghost.className = 'line-ghost pointer-events-none fixed z-50 truncate border-2 border-border bg-surface px-3 py-2 font-medium'
    ghost.hidden = true
    let follow: ((e: DragEvent) => void) | null = null
    const show = (drop: Drop | null | undefined) => {
      mark.hidden = drop?.top == null
      into.hidden = !drop?.into
      if (!drop) return
      const box = mark.parentElement!.getBoundingClientRect()
      const top = (y: number) => `${y - box.top + mark.parentElement!.scrollTop}px`
      if (drop.top != null) mark.style.top = top(drop.top)
      mark.style.left = `${drop.left - box.left}px`
      mark.toggleAttribute('data-inside', drop.zone === 'inside')
      if (!drop.into) return
      into.style.top = top(drop.into.top)
      into.style.left = `${drop.into.left - box.left}px`
      into.style.height = `${drop.into.bottom - drop.into.top}px`
    }
    const target = (view: EditorView, e: DragEvent) => {
      const from = dragged?.()
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
      // A thumb that misses a checkbox mostly lands on its grip.
      dragByTouch(el, () => el.closest('li')!.querySelector<HTMLInputElement>(':scope > label > input')?.click())
      // The editor drags whatever is selected, so the line becomes the selection.
      el.addEventListener('dragstart', (e) => {
        const at = line()
        if (at == null) return
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)).setMeta(held, at))
        dragged = line
        const row = el.closest('li')!.getBoundingClientRect()
        ghost.textContent = view.state.doc.nodeAt(at)!.firstChild!.textContent
        ghost.style.width = `${row.width}px`
        ghost.hidden = false
        // A finger's drag is ours, so the box follows it a row above the finger, keeping the line it would land
        // on in sight. A pointer's is the browser's, which takes a picture of the box.
        const x = e.clientX - row.left
        const y = e.clientY - row.top + (e.isTrusted ? 0 : 48)
        follow = (move) => {
          ghost.style.left = `${move.clientX - x}px`
          ghost.style.top = `${move.clientY - y}px`
        }
        follow(e)
        if (!e.isTrusted) return document.addEventListener('dragover', follow)
        e.dataTransfer?.setDragImage(ghost, x, y)
        requestAnimationFrame(() => (ghost.hidden = true))
      })
      el.addEventListener('dragend', () => {
        dragged = null
        show(null)
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(held, null))
        ghost.hidden = true
        if (follow) document.removeEventListener('dragover', follow)
      })
      return el
    }
    return [
      new Plugin({
        key: held,
        // Where the line being dragged is, so it stays dimmed in place.
        state: {
          init: () => null as number | null,
          apply: (tr, at: number | null) => {
            const meta = tr.getMeta(held) as number | null | undefined
            return meta !== undefined ? meta : at == null ? null : tr.mapping.map(at)
          },
        },
        view: (view) => {
          view.dom.parentElement!.append(mark, into)
          document.body.append(ghost)
          return {
            destroy: () => {
              mark.remove()
              into.remove()
              ghost.remove()
            },
          }
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
            const at = held.getState(state)
            const line = at == null ? null : state.doc.nodeAt(at)
            if (line) grips.push(Decoration.node(at!, at! + line.nodeSize, { class: 'line-held' }))
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
            if (drop) dropLine(view, dragged()!, drop)
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

// Words typed as a date, where they sit in the note. `alone` while the line holds nothing else, which is a line
// about a day, not a task for it.
interface TypedWords extends Typed {
  text: string
  alone: boolean
}
const typedWords = new PluginKey<TypedWords | null>('typedWords')

// What a transaction changed, if it only changed the text of `$from`'s line, as typing does. A tick, an indent or a
// new date isn't typing.
function typedOn(tr: Transaction, $from: ResolvedPos) {
  const changed: [number, number][] = []
  tr.mapping.maps.forEach((map, i) =>
    map.forEach((_from, _to, from, to) => {
      const later = tr.mapping.slice(i + 1)
      changed.push([later.map(from, -1), later.map(to)])
    }),
  )
  return changed.length > 0 && changed.every(([from, to]) => from >= $from.start() && to <= $from.end()) ? changed : null
}

// The dates typed into `$pos`'s line, when it is a checkbox line's own text.
function typedIn($pos: ResolvedPos): TypedWords[] {
  if ($pos.depth < 2 || $pos.node(-1).type.name !== 'taskItem' || $pos.index(-1) !== 0) return []
  // Each thing that isn't text counts as one letter, so the words sit where the note has them.
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, '\ufffc')
  return typedDates(text).map((typed) => ({
    ...typed,
    from: $pos.start() + typed.from,
    to: $pos.start() + typed.to,
    text: text.slice(typed.from, typed.to),
    alone: !(text.slice(0, typed.from) + text.slice(typed.to)).trim(),
  }))
}

// The text of each task checked in the note, so typing can offer it again, keyed without case or extra spaces. It
// only grows, which stays small for the few hundred different tasks a family's list checks over the years.
interface Checked {
  text: string
  at: number
}
const checkedTasks = (state: EditorState) => ySyncPluginKey.getState(state)!.doc.getMap<Checked>('checked')
const keyOf = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

const chipLabel = (due: string, repeat: string | null) => `${parseRule(repeat) ? '↻ ' : ''}${dueLabel(due)}`

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
      // A user id.
      assignee: {
        default: null,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-assignee'),
        renderHTML: ({ assignee }) => (assignee ? { 'data-assignee': assignee } : {}),
      },
      // Who assigned the line to someone else, until the server has told them. A pasted copy tells nobody.
      assignedBy: {
        default: null,
        keepOnSplit: false,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    }
  },
  // The date, its repeat and the person follow the line's text, the way Obsidian's Tasks plugin writes them.
  renderMarkdown(node, h, ctx) {
    const { due, repeat, assignee } = node.attrs ?? {}
    const rule = due && parseRule(repeat)
    const words = rule ? describeRule(rule, parseDay(due.split('T')[0])) : ''
    const person = store.users.find((u) => u.id === assignee)
    const tail = [
      due && `📅 ${due.replace('T', ' ')}`,
      words && `🔁 ${words[0].toLowerCase()}${words.slice(1)}`,
      person && `@${person.name.split(' ')[0]}`,
    ].filter(Boolean)
    if (tail.length === 0) return this.parent!(node, h, ctx)
    const [line, ...nested] = node.content!
    const text = [...(line.content ?? []), { type: 'text', text: ` ${tail.join(' ')}` }]
    return this.parent!({ ...node, content: [{ ...line, content: text }, ...nested] }, h, ctx)
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
      // The person's first name follows the date and opens the box that assigns the line.
      const person = document.createElement('span')
      person.className = 'person-chip'
      person.contentEditable = 'false'
      // How many of the tasks directly under the line are checked.
      const count = document.createElement('span')
      count.className = 'task-count'
      count.contentEditable = 'false'
      li.append(chip, person, count)
      // While typed words wait to become the date, the chip shows the date they make, and a tap keeps the words.
      const showChips = (node: Node, decorations: readonly Decoration[]) => {
        const { due, repeat, checked } = node.attrs
        const typed = decorations.find((d) => d.spec.typed)?.spec.typed as string | undefined
        if (typed) chip.dataset.label = `${typed} ✕`
        else if (due) chip.dataset.label = chipLabel(due, repeat)
        else delete chip.dataset.label
        chip.toggleAttribute('data-typed', typed != null)
        chip.toggleAttribute('data-overdue', Boolean(due) && !checked && overdue(due))
        const name = decorations.find((d) => d.spec.person)?.spec.person as string | undefined
        if (name) person.dataset.label = name
        else delete person.dataset.label
        let tasks = 0
        let done = 0
        node.forEach((child) => {
          if (child.type.name !== 'taskList') return
          tasks += child.childCount
          child.forEach((task) => {
            if (task.attrs.checked) done++
          })
        })
        if (tasks) count.dataset.label = `${done}/${tasks}`
        else delete count.dataset.label
        li.toggleAttribute('data-count', tasks > 0)
      }
      showChips(props.node, props.decorations)
      const openBox = (event: string) => {
        const pos = getPos()
        if (!editor.isEditable || pos == null) return
        editor.commands.setTextSelection(pos + editor.state.doc.nodeAt(pos)!.firstChild!.nodeSize)
        editor.view.dom.dispatchEvent(new Event(event))
      }
      chip.addEventListener('mousedown', (e) => e.preventDefault())
      chip.addEventListener('click', () => {
        if (editor.isEditable && chip.hasAttribute('data-typed')) {
          return editor.view.dispatch(editor.state.tr.setMeta(typedWords, 'keep'))
        }
        openBox('due-date')
      })
      person.addEventListener('mousedown', (e) => e.preventDefault())
      person.addEventListener('click', () => openBox('assign'))
      // A press beside the line's text, such as after its count or below the text, lands on the line itself, where
      // the browser and the editor would put the cursor on the line below first. It goes to the nearest spot in the
      // text instead.
      li.addEventListener('mousedown', (e) => {
        if (e.target !== li || e.button !== 0 || !editor.isEditable) return
        e.preventDefault()
        e.stopPropagation()
        const p = li.querySelector(':scope > div > p')!
        const text = p.getBoundingClientRect()
        const row = parseFloat(getComputedStyle(p).lineHeight) / 2
        const within = (at: number, min: number, max: number) => Math.min(Math.max(at, min), max)
        const at = editor.view.posAtCoords({
          left: within(e.clientX, text.left + 1, text.right - 1),
          top: within(e.clientY, text.top + row, text.bottom - row),
        })
        if (!at) return
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(at.pos))))
        editor.view.focus()
      })
      // A line checked here or on another device lingers until the note is still. Lines checked before the
      // note opened don't.
      const update = view.update!
      view.update = (node, decorations, inner) => {
        const was = li.dataset.checked === 'true'
        if (!update(node, decorations, inner)) return false
        if (node.attrs.checked !== was) li.toggleAttribute('data-lingering', node.attrs.checked)
        showChips(node, decorations)
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
          const text = line.firstChild!.textContent.trim()
          if (checked && !repeats && text) checkedTasks(editor.state).set(keyOf(text), { text, at: Date.now() })
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
  // Words typed as a date are marked while the cursor stays on their line, and leaving the line turns them into
  // its date. Until then Escape or a tap on the chip keeps them as words, and afterwards Undo brings them back.
  // Only words this person just typed count, so a line that already says Sunday roast stays as it is.
  addProseMirrorPlugins() {
    return [
      new Plugin<TypedWords | null>({
        key: typedWords,
        state: {
          init: () => null,
          apply: (tr, was, _old, state) => {
            if (tr.getMeta(typedWords)) return null
            const { $from } = state.selection
            const found = typedIn($from)
            // Someone else's edit redraws the whole note, so the words are found again by what they say.
            if (tr.getMeta(ySyncPluginKey)) return found.find((words) => words.text === was?.text) ?? null
            const changed = typedOn(tr, $from)
            const typed =
              changed &&
              found.find((words) =>
                changed.some(([from, to]) => (from === to ? from >= words.from && from <= words.to : from < words.to && to > words.from)),
              )
            const at = was && tr.mapping.mapResult(was.from)
            return typed || (at && !at.deleted && found.find((words) => words.from === at.pos)) || null
          },
        },
        appendTransaction: (trs, oldState, state) => {
          const was = typedWords.getState(oldState)
          if (!was || trs.some((tr) => tr.getMeta(ySyncPluginKey) || tr.getMeta(typedWords) === 'keep')) return null
          const at = new Mapping(trs.flatMap((tr) => tr.mapping.maps)).mapResult(was.from)
          if (at.deleted) return null
          const $at = state.doc.resolve(at.pos)
          const left = trs.some((tr) => tr.getMeta(typedWords) === 'leave') || !state.selection.$from.sameParent($at)
          const words = left && typedIn($at).find((words) => words.from === at.pos)
          if (!words || words.alone) return null

          const attrs = $at.node(-1).attrs
          const { due, repeat } = withTyped(attrs, words)
          // A line that gets a time lasts as long as the last length this person picked.
          const picked = !attrs.due?.includes('T') && due.includes('T') ? settings().get('duration') : null
          // The words take a space beside them along.
          const space = (pos: number) => pos >= $at.start() && pos < $at.end() && /\s/.test(state.doc.textBetween(pos, pos + 1))
          const from = space(words.from - 1) ? words.from - 1 : words.from
          const to = from === words.from && space(words.to) ? words.to + 1 : words.to
          // A step of its own, so Undo brings back the words without taking the rest of the line.
          yUndoPluginKey.getState(state)?.undoManager.stopCapturing()
          void enableAlerts()
          return state.tr
            .setNodeMarkup($at.before(-1), undefined, { ...attrs, due, repeat, duration: attrs.duration ?? picked ?? null })
            .delete(from, to)
        },
        props: {
          handleKeyDown: (view, e) => {
            const words = typedWords.getState(view.state)
            if (e.key !== 'Escape' || !words) return false
            view.dispatch(view.state.tr.setMeta(typedWords, 'keep'))
            return true
          },
          decorations: (state) => {
            const words = typedWords.getState(state)
            if (!words) return null
            const $from = state.doc.resolve(words.from)
            const { due, repeat } = withTyped($from.node(-1).attrs, words)
            return DecorationSet.create(state.doc, [
              Decoration.inline(words.from, words.to, { class: 'typed-words' }),
              Decoration.node($from.before(-1), $from.after(-1), { 'data-typed': '' }, { typed: chipLabel(due, repeat) }),
            ])
          },
        },
        // The line may never be left, since the app or the note can close first.
        view: (view) => {
          const leave = () => {
            const words = typedWords.getState(view.state)
            if (words && !words.alone) view.dispatch(view.state.tr.setMeta(typedWords, 'leave'))
          }
          const hidden = () => {
            if (!document.hidden) return
            if (!view.composing) return leave()
            // A word the keyboard is still writing would come back after the words leave, once the keyboard lets
            // go of it. Blurring makes it let go at once.
            view.dom.blur()
            setTimeout(leave, 50)
          }
          document.addEventListener('visibilitychange', hidden)
          return {
            destroy: () => {
              document.removeEventListener('visibilitychange', hidden)
              leave()
            },
          }
        },
      }),
    ]
  },
})

// Assigns the checkbox line at `pos` to someone on the note, or to nobody, and takes out the `@` and name that picked
// them. The server tells them, unless they assigned it to themselves.
export function assign(view: EditorView, pos: number, user: string | null, words?: { from: number; to: number }) {
  const me = store.me!.id
  const tr = view.state.tr.setNodeMarkup(pos, undefined, {
    ...view.state.doc.nodeAt(pos)!.attrs,
    assignee: user,
    assignedBy: user && user !== me ? me : null,
  })
  // The words take the space before them along.
  if (words) tr.delete(/\s/.test(tr.doc.textBetween(words.from - 1, words.from)) ? words.from - 1 : words.from, words.to)
  view.dispatch(tr)
}

// `@` and the start of a name, typed right before the cursor on a checkbox line's own text, and the people on the note
// it could be. Escape keeps it as text.
interface TypedPerson {
  from: number
  to: number
  line: number
  matches: User[]
}
type People = { at: TypedPerson | null; kept: number | null }
export const typedPerson = new PluginKey<People>('typedPerson')

// Each assigned line names its person while they are on the note, and `@` and a name assigns a line on a note shared
// with someone.
export const Assignees = (people: () => User[]) =>
  Extension.create({
    name: 'assignees',
    // Ahead of the list's Enter, which would split the line instead of picking the person.
    priority: 101,
    addProseMirrorPlugins() {
      return [
        new Plugin<People>({
          key: typedPerson,
          state: {
            init: () => ({ at: null, kept: null }),
            apply: (tr, was, _old, state) => {
              const kept =
                tr.getMeta(typedPerson) === 'keep' ? (was.at?.from ?? null) : was.kept == null ? null : tr.mapping.map(was.kept)
              const { $from, empty } = state.selection
              const onLine = empty && $from.depth >= 2 && $from.node(-1).type.name === 'taskItem' && $from.index(-1) === 0
              const before = onLine ? $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc') : ''
              const typed = /(?:^|\s)@([\p{L}\p{N}]*)$/u.exec(before)
              if (!typed) return { at: null, kept: null }
              const from = $from.pos - typed[1].length - 1
              if (from === kept) return { at: null, kept }
              const all = people()
              const query = typed[1].toLowerCase()
              const matches = all.length > 1 ? all.filter((u) => u.name.toLowerCase().startsWith(query)) : []
              return { at: matches.length ? { from, to: $from.pos, line: $from.before(-1), matches } : null, kept: null }
            },
          },
          props: {
            handleKeyDown: (view, e) => {
              if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
              const { at } = typedPerson.getState(view.state)!
              if (!at || (e.key !== 'Escape' && e.key !== 'Enter')) return false
              if (e.key === 'Escape') view.dispatch(view.state.tr.setMeta(typedPerson, 'keep'))
              else assign(view, at.line, at.matches[0].id, at)
              return true
            },
            decorations: (state) => {
              const named = people()
              const found: Decoration[] = []
              state.doc.descendants((node, pos) => {
                const person = node.attrs.assignee && named.find((u) => u.id === node.attrs.assignee)
                if (node.type.name === 'taskItem' && person) {
                  found.push(Decoration.node(pos, pos + node.nodeSize, {}, { person: person.name.split(' ')[0] }))
                }
              })
              return DecorationSet.create(state.doc, found)
            },
          },
        }),
      ]
    },
  })

// While someone types on a task line, the tasks checked in the note before that have a word starting with what the
// line says, most recently checked first. Escape or a pick closes the box until the cursor leaves the line.
interface Suggesting {
  from: number
  to: number
  matches: string[]
  // The one Enter picks, chosen with the arrows.
  chosen: number
  closed: boolean
}
export const suggestions = new PluginKey<Suggesting | null>('suggestions')

function suggest(doc: Node, record: Y.Map<Checked>, line: string) {
  const typed = keyOf(line)
  if (typed.length < 2) return []
  const startsWord = (text: string) => {
    for (let at = text.indexOf(typed); at >= 0; at = text.indexOf(typed, at + 1)) {
      if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true
    }
    return false
  }
  // Tasks still to do are on the list already, and so is the line itself.
  const open = new Set([typed])
  const found = new Map<string, Checked>()
  doc.descendants((node) => {
    if (node.type.name !== 'taskItem') return
    const text = node.firstChild!.textContent.trim()
    if (node.attrs.checked) found.set(keyOf(text), { text, at: 0 })
    else open.add(keyOf(text))
  })
  for (const [key, checked] of record) found.set(key, checked)
  return [...found]
    .filter(([key]) => !open.has(key) && startsWord(key))
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, 5)
    .map(([, { text }]) => text)
}

// The line's text becomes the suggestion, with the cursor at its end. Date words in the picked task stay as words.
export function pickSuggestion(view: EditorView, text: string) {
  const { from, to } = suggestions.getState(view.state)!
  view.dispatch(view.state.tr.insertText(text, from, to).setMeta(suggestions, 'close').setMeta(typedWords, 'keep'))
}

export const Suggestions = Extension.create({
  name: 'suggestions',
  // Ahead of the list's Enter and the arrows.
  priority: 101,
  addProseMirrorPlugins: () => [
    new Plugin<Suggesting | null>({
      key: suggestions,
      state: {
        init: () => null,
        apply: (tr, was, old, state) => {
          const { $from, empty } = state.selection
          if (!empty || $from.depth < 2 || $from.node(-1).type.name !== 'taskItem' || $from.index(-1) !== 0) return null
          // Someone else's edit redraws the whole note, and the cursor stays on its line.
          const stayed = was != null && (tr.getMeta(ySyncPluginKey) != null || tr.mapping.map(was.from, -1) === $from.start())
          if (!stayed && !typedOn(tr, $from)) return null
          const meta = tr.getMeta(suggestions) as 'close' | number | undefined
          const closed = meta === 'close' || (stayed && was!.closed)
          return {
            from: $from.start(),
            to: $from.end(),
            matches: closed ? [] : suggest(state.doc, checkedTasks(old), $from.parent.textContent),
            chosen: typeof meta === 'number' ? meta : stayed && !tr.docChanged ? was!.chosen : -1,
            closed,
          }
        },
      },
      props: {
        handleKeyDown: (view, e) => {
          if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false
          const at = suggestions.getState(view.state)
          if (!at?.matches.length) return false
          const send = (meta: 'close' | number) => view.dispatch(view.state.tr.setMeta(suggestions, meta))
          if (e.key === 'Escape') send('close')
          else if (e.key === 'ArrowDown') send(Math.min(at.chosen + 1, at.matches.length - 1))
          else if (e.key === 'ArrowUp') send(Math.max(at.chosen - 1, -1))
          else if (e.key === 'Enter' && at.chosen >= 0) pickSuggestion(view, at.matches[at.chosen])
          else return false
          return true
        },
      },
    }),
  ],
})

// A line is done once it and every line nested under it are checked. Only a done line hides, with what is
// nested under it, and only done lines are deleted. The server's widget lines follow the same rule.
export function done(node: Node) {
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

// The nearest place to type from `pos` in direction `dir`, skipping hidden and folded lines.
function visibleFrom(state: EditorState, pos: number, dir: -1 | 1) {
  const folded = foldedLines.getState(state)
  let found = Selection.findFrom(state.doc.resolve(pos), dir, true)
  while (found) {
    const doneAt = doneDepth(found.$from)
    if (doneAt) {
      found = Selection.findFrom(state.doc.resolve(dir < 0 ? found.$from.before(doneAt) : found.$from.after(doneAt)), dir, true)
      continue
    }
    const foldAt = folded ? foldsHolding(found.$from, folded)[0] : 0
    if (!foldAt) return found
    found = Selection.findFrom(
      state.doc.resolve(dir < 0 ? found.$from.before(foldAt) + found.$from.node(foldAt).firstChild!.nodeSize : found.$from.after(foldAt)),
      dir,
      true,
    )
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
              const lingering = view.dom.querySelectorAll('[data-lingering]')
              for (const li of lingering) li.removeAttribute('data-lingering')
              if (lingering.length && !view.isDestroyed) {
                view.dispatch(
                  view.state.tr
                    .setMeta('linkBox', 'updatePosition')
                    .setMeta('personBox', 'updatePosition')
                    .setMeta('suggestionBox', 'updatePosition'),
                )
              }
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

// The ids of the lines folded in the open note.
export const foldedLines = new PluginKey<Set<string>>('foldedLines')

// The depths of the folded lines whose nested lines hold `$pos`, outermost first.
export function foldsHolding($pos: ResolvedPos, folded: Set<string>) {
  const depths: number[] = []
  for (let depth = 1; depth < $pos.depth; depth++) {
    const node = $pos.node(depth)
    if (isLine(node) && folded.has(node.attrs.id) && $pos.node(depth + 1).type.name in ITEM) depths.push(depth)
  }
  return depths
}

const hasNested = (node: Node) => node.content.content.some((child) => child.type.name in ITEM)

// A list line with lines nested under it has a chevron in the margin beside its grip, which folds them away for
// this person on every device of theirs. It shows like the grip, and always on a folded line. Folding a line first
// gives it an id, so in a note this person can't edit, only a line that already has one folds.
export const FoldLines = (note: string) =>
  Extension.create({
    name: 'foldLines',
    // At the end of a folded line, Enter starts the next line below what it hides and ArrowRight steps over it
    // (WebKit otherwise steps into the hidden nested list and snaps back).
    addKeyboardShortcuts() {
      const atFoldedEnd = () => {
        const { state } = this.editor
        const { $from, empty } = state.selection
        if (!empty || $from.depth < 2 || $from.parentOffset < $from.parent.content.size || $from.index(-1) > 0) return null
        const line = $from.node(-1)
        if (!isLine(line) || !hasNested(line) || !foldedLines.getState(state)!.has(line.attrs.id)) return null
        return { state, $from, line }
      }
      return {
        Enter: () => {
          if (!this.editor.isEditable) return false
          const hit = atFoldedEnd()
          if (!hit) return false
          const after = hit.$from.after(-1)
          const tr = hit.state.tr.insert(after, hit.line.type.create(null, hit.state.schema.nodes.paragraph.create()))
          this.editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 2)).scrollIntoView())
          return true
        },
        ArrowRight: () => {
          const hit = atFoldedEnd()
          if (!hit) return false
          const next = Selection.findFrom(hit.state.doc.resolve(hit.$from.after(-1)), 1, true)
          if (next) this.editor.view.dispatch(hit.state.tr.setSelection(next).scrollIntoView())
          return true
        },
      }
    },
    addProseMirrorPlugins() {
      const { editor } = this
      const writeFolds = (ids: string[]) => (ids.length ? folds().set(note, ids) : folds().delete(note))
      // A line that shares its id with another, as a copy of it does, gets its own first, so a fold never folds both.
      const toggle = (view: EditorView, at: number) => {
        const line = view.state.doc.nodeAt(at)!
        let shared = false
        view.state.doc.descendants((node, pos) => {
          shared ||= pos !== at && line.attrs.id != null && node.attrs.id === line.attrs.id
          return !shared
        })
        const id = line.attrs.id && !shared ? line.attrs.id : crypto.randomUUID()
        if (id !== line.attrs.id) view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...line.attrs, id }).setMeta('addToHistory', false))
        const folded = [...foldedLines.getState(view.state)!]
        writeFolds(folded.includes(line.attrs.id) ? folded.filter((other) => other !== id) : [...folded, id])
      }
      const chevron = (open: boolean) => (view: EditorView, getPos: () => number | undefined) => {
        const el = document.createElement('span')
        el.className = 'line-fold'
        el.contentEditable = 'false'
        el.role = 'button'
        el.ariaLabel = el.title = open ? 'Collapse' : 'Expand'
        el.ariaExpanded = String(open)
        el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${open ? CHEVRON_DOWN : CHEVRON_RIGHT}"/></svg>`
        // The cursor and the keyboard stay where they were.
        el.addEventListener('mousedown', (e) => e.preventDefault())
        el.addEventListener('click', () => {
          const pos = getPos()
          if (pos != null) toggle(view, pos - 1)
        })
        return el
      }
      return [
        new Plugin<Set<string>>({
          key: foldedLines,
          state: {
            init: () => new Set(folds().get(note)),
            apply: (tr, was) => {
              const meta = tr.getMeta(foldedLines)
              return meta instanceof Set ? meta : was
            },
          },
          // Our own edit that takes the cursor into folded lines, such as Tab, or opening the note at a folded line,
          // unfolds them. Anything else, such as a fold on another device, moves the cursor to the end of the folded line.
          appendTransaction: (transactions, _old, state) => {
            const folded = foldedLines.getState(state)!
            const { $from } = state.selection
            const depths = foldsHolding($from, folded)
            if (!depths.length) return null
            if (transactions.some((tr) => (tr.docChanged && !tr.getMeta(ySyncPluginKey)) || tr.getMeta(foldedLines) === 'reveal')) {
              const holding = depths.map((depth) => $from.node(depth).attrs.id)
              const open = [...folded].filter((id) => !holding.includes(id))
              // Writing the tree now would redraw the note while this transaction is still being applied.
              queueMicrotask(() => writeFolds(open))
              return state.tr.setMeta(foldedLines, new Set(open))
            }
            const [depth] = depths
            return state.tr.setSelection(TextSelection.create(state.doc, $from.before(depth) + $from.node(depth).firstChild!.nodeSize))
          },
          view: (view) => {
            const changed = ({ keysChanged }: { keysChanged: Set<string> }) => {
              if (keysChanged.has(note)) view.dispatch(view.state.tr.setMeta(foldedLines, new Set(folds().get(note))))
            }
            folds().observe(changed)
            return { destroy: () => folds().unobserve(changed) }
          },
          props: {
            decorations: (state) => {
              const folded = foldedLines.getState(state)!
              const found: Decoration[] = []
              state.doc.descendants((node, pos) => {
                if (!isLine(node) || !hasNested(node)) return
                if (!node.attrs.id && !editor.isEditable) return
                const open = !folded.has(node.attrs.id)
                found.push(
                  Decoration.widget(pos + 1, chevron(open), {
                    side: -2,
                    key: open ? 'collapse' : 'expand',
                    ignoreSelection: true,
                    stopEvent: () => true,
                  }),
                )
                if (!open) found.push(Decoration.node(pos, pos + node.nodeSize, { 'data-folded': '' }))
              })
              return DecorationSet.create(state.doc, found)
            },
          },
        }),
      ]
    },
  })

// One step, so Undo brings them all back. Going from the end keeps the earlier positions valid, and
// deleteRange takes a list along with its last line. A task no device saw checked, such as one an alert ticked, is
// remembered as checked now.
export function deleteChecked(editor: Editor) {
  const lines: [number, number][] = []
  const texts: string[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!done(node)) return
    lines.push([pos, pos + node.nodeSize])
    texts.push(node.firstChild!.textContent.trim())
    node.descendants((task) => {
      if (task.type.name === 'taskItem') texts.push(task.firstChild!.textContent.trim())
    })
    return false
  })
  const record = checkedTasks(editor.state)
  record.doc!.transact(() => {
    for (const text of texts) {
      if (text && !record.has(keyOf(text))) record.set(keyOf(text), { text, at: Date.now() })
    }
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
