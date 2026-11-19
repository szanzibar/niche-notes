import { TaskItem as TipTapTaskItem } from '@tiptap/extension-list'
import type { Node, ResolvedPos } from '@tiptap/pm/model'
import { type EditorState, NodeSelection, Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { Extension, type Editor } from '@tiptap/react'
import { yUndoPluginKey, ySyncPluginKey } from '@tiptap/y-tiptap'
import { enableAlerts } from '../lib/alerts'
import { settings } from '../sync/tree'
import { dueLabel, nextDue, overdue, parseRule, type Typed, typedDates, withTyped } from './dates'
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

// A finger lifts a line by holding its grip this long, so a thumb that moves sooner scrolls the note and one that
// lets go sooner taps.
const HOLD_MS = 300
// A dragging finger this near the top or bottom of the note scrolls it, faster the nearer it gets.
const EDGE = 48

// A held grip plays the drag events the editor moves lines with, since a phone's own drag waits for its long press,
// if it has one at all.
export function dragByTouch(grip: HTMLElement | null, onTap?: () => void) {
  if (!grip) return
  const start = (down: TouchEvent) => {
    const dataTransfer = new DataTransfer()
    const first = down.touches[0]
    let at = first
    let dragging = false
    const fire = (type: string, target: Element | null) =>
      target?.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX: at.clientX, clientY: at.clientY }),
      )
    // Android's long press would start the browser's drag of the grip on top of this one.
    const native = (e: DragEvent) => {
      if (!e.isTrusted) return
      e.preventDefault()
      e.stopPropagation()
    }
    let scroller = grip.parentElement!
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
      // The keyboard comes back only for a tap to type, never for a drop under a cursor left in the note.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      fire('dragstart', grip)
      while (getComputedStyle(scroller).overflowY !== 'auto') scroller = scroller.parentElement!
      scrollNearEdge()
    }, HOLD_MS)
    const move = (e: TouchEvent) => {
      at = e.touches[0]
      if (!dragging) {
        // A finger drifts a few pixels during a tap. A move the browser can't cancel is already scrolling.
        if (!e.cancelable || Math.hypot(at.clientX - first.clientX, at.clientY - first.clientY) >= 10) stop()
        return
      }
      e.preventDefault()
      fire('dragover', document.elementFromPoint(at.clientX, at.clientY))
    }
    // Without a tap's mouse events, the editor doesn't take the cursor and raise the keyboard.
    const end = (e: TouchEvent) => {
      e.preventDefault()
      if (dragging) {
        if (e.type === 'touchend') fire('drop', document.elementFromPoint(at.clientX, at.clientY))
        fire('dragend', grip)
      } else if (e.type === 'touchend') onTap?.()
      stop()
    }
    const stop = () => {
      dragging = false
      clearTimeout(lift)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
      document.removeEventListener('dragstart', native, true)
    }
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', end)
    document.addEventListener('touchcancel', end)
    document.addEventListener('dragstart', native, true)
  }
  // A held finger would otherwise open the phone's menu or select text.
  const hold = (e: Event) => e.preventDefault()
  grip.addEventListener('touchstart', start)
  grip.addEventListener('contextmenu', hold)
  return () => {
    grip.removeEventListener('touchstart', start)
    grip.removeEventListener('contextmenu', hold)
  }
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
    const nested = li.querySelector(':scope > div > :is(ul, ol), :scope > :is(ul, ol)')
    const bottom = nested ? nested.getBoundingClientRect().top : row.bottom
    if (y < row.top || y >= bottom) return
    if (pos >= from && pos < end) found = null
    else {
      const at = (y - row.top) / (bottom - row.top)
      const zone = at < 0.3 ? 'before' : at > 0.7 && !nested ? 'after' : 'inside'
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
      // While typed words wait to become the date, the chip shows the date they make, and a tap keeps the words.
      const showDue = (node: Node, decorations: readonly Decoration[]) => {
        const { due, repeat, checked } = node.attrs
        const typed = decorations.find((d) => d.spec.typed)?.spec.typed as string | undefined
        if (typed) chip.dataset.label = `${typed} ✕`
        else if (due) chip.dataset.label = chipLabel(due, repeat)
        else delete chip.dataset.label
        chip.toggleAttribute('data-typed', typed != null)
        chip.toggleAttribute('data-overdue', Boolean(due) && !checked && overdue(due))
      }
      showDue(props.node, props.decorations)
      chip.addEventListener('mousedown', (e) => e.preventDefault())
      chip.addEventListener('click', () => {
        const pos = getPos()
        if (!editor.isEditable || pos == null) return
        if (chip.hasAttribute('data-typed')) return editor.view.dispatch(editor.state.tr.setMeta(typedWords, 'keep'))
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
      view.update = (node, decorations, inner) => {
        const was = li.dataset.checked === 'true'
        if (!update(node, decorations, inner)) return false
        if (node.attrs.checked !== was) li.toggleAttribute('data-lingering', node.attrs.checked)
        showDue(node, decorations)
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
            const changed: [number, number][] = []
            tr.mapping.maps.forEach((map, i) =>
              map.forEach((_from, _to, from, to) => {
                const later = tr.mapping.slice(i + 1)
                changed.push([later.map(from, -1), later.map(to)])
              }),
            )
            // Typing changes the line's text and nothing else. A tick, an indent or a new date isn't typing.
            const typing = changed.length > 0 && changed.every(([from, to]) => from >= $from.start() && to <= $from.end())
            const typed =
              typing &&
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
          const hidden = () => document.hidden && leave()
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
