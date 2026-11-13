import type { Editor } from '@tiptap/react'
import { useEffect, useReducer, useState } from 'react'
import { enableAlerts } from '../lib/alerts'
import { inDays, REPEATS } from './dates'
import {
  BoldIcon,
  BulletListIcon,
  CalendarIcon,
  CheckIcon,
  CodeBlockIcon,
  ChecklistIcon,
  CodeIcon,
  DividerIcon,
  HeadingIcon,
  HighlightIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  OpenLinkIcon,
  OutdentIcon,
  QuoteIcon,
  RedoIcon,
  StrikeIcon,
  TrashIcon,
  UndoIcon,
  UnlinkIcon,
} from './icons'
import { listPosition, toggleList } from './lists'
import { Popover } from './Popover'

const ICON = 'h-5 w-5'
const FIELD = 'h-9 min-w-0 flex-1 border-2 border-border bg-bg px-2 outline-none focus:border-accent'

export function Toolbar({ editor }: { editor: Editor | null }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  // One box opens above the bar at a time: text styles, the address of a link, or a checkbox line's date.
  const [row, setRow] = useState<'styles' | 'link' | 'due' | null>(null)
  const [href, setHref] = useState('')
  useEffect(() => {
    if (!editor) return
    // A tap on a line's date opens its box too.
    const due = () => setRow('due')
    const dom = editor.view.dom
    editor.on('transaction', force)
    dom.addEventListener('due-date', due)
    return () => {
      editor.off('transaction', force)
      dom.removeEventListener('due-date', due)
    }
  }, [editor])
  if (!editor) return null

  const { item, list, depth } = listPosition(editor)
  const listItem = item ?? 'listItem'
  const link = editor.getAttributes('link').href as string | undefined
  const chain = () => editor.chain().focus()
  // The link box's input holds focus, and TipTap only takes it back on the next frame, so the editor
  // takes it before the box goes.
  const close = () => {
    editor.view.focus()
    setRow(null)
  }
  const style = (apply: () => void) => {
    close()
    apply()
  }
  const openLink = (open: boolean) => {
    if (!open) return close()
    setHref(link ?? '')
    setRow('link')
  }
  // Dates belong to checkbox lines. Each change applies at once, and only a quick pick or Remove closes the box,
  // so a time or a repeat can follow a date.
  const linePos = item === 'taskItem' ? editor.state.selection.$from.before(depth) : null
  const line = linePos == null ? null : editor.state.doc.nodeAt(linePos)
  const due = line?.attrs.due as string | null | undefined
  const [day = '', time = ''] = due?.split('T') ?? []
  const setDue = (next: string | null, repeat = line!.attrs.repeat) => {
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(linePos!, undefined, { ...line!.attrs, due: next, repeat: next ? repeat : null })
        return true
      })
      .run()
    if (next) void enableAlerts()
  }
  const pick = (next: string | null) => {
    setRow(null)
    setDue(next && time ? `${next}T${time}` : next)
  }

  const applyLink = () => {
    close()
    const typed = href.trim()
    if (!typed) return
    // A bare address like example.com would otherwise link to a page on this site.
    const url = /^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : `https://${typed}`
    if (!editor.state.selection.empty || editor.isActive('link')) {
      return chain().extendMarkRange('link').setLink({ href: url }).run()
    }
    chain()
      .insertContent({ type: 'text', text: typed, marks: [{ type: 'link', attrs: { href: url } }] })
      .run()
  }

  return (
    <div className="relative shrink-0 border-t-2 border-border bg-surface">
      {!row && link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link"
          className="absolute bottom-full left-2 mb-2 flex h-9 max-w-[calc(100%-1rem)] items-center gap-2 border-2 border-border bg-surface px-2 font-bold shadow-brutal"
        >
          <OpenLinkIcon className={`${ICON} shrink-0`} />
          <span className="truncate">{link}</span>
        </a>
      )}
      <div className="flex gap-2 overflow-x-auto p-2">
        <Group>
          <Tool label="Checklist" active={list === 'taskList'} onClick={() => toggleList(editor, 'taskList')}>
            <ChecklistIcon className={ICON} />
          </Tool>
          <Tool label="Bullet list" active={list === 'bulletList'} onClick={() => toggleList(editor, 'bulletList')}>
            <BulletListIcon className={ICON} />
          </Tool>
          <Tool label="Numbered list" active={list === 'orderedList'} onClick={() => toggleList(editor, 'orderedList')}>
            <NumberedListIcon className={ICON} />
          </Tool>
        </Group>
        <Group>
          <Popover
            side="top"
            open={row === 'due'}
            onOpenChange={(open) => setRow(open ? 'due' : null)}
            className="w-[min(calc(100vw-1rem),19rem)]"
            trigger={
              <Tool label="Date" disabled={!line} active={row === 'due' || Boolean(due)}>
                <CalendarIcon className={ICON} />
              </Tool>
            }
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-1">
              <Group className="[&>*]:flex-1">
                {(
                  [
                    ['Today', 0],
                    ['Tomorrow', 1],
                    ['Next week', 7],
                  ] as const
                ).map(([label, days]) => (
                  <Tool key={label} label={label} onClick={() => pick(inDays(days))}>
                    {label}
                  </Tool>
                ))}
              </Group>
              <div className="flex gap-1">
                <input
                  type="date"
                  aria-label="Day"
                  value={day}
                  onChange={(e) => setDue(e.target.value ? (time ? `${e.target.value}T${time}` : e.target.value) : null)}
                  className={FIELD}
                />
                <input
                  type="time"
                  aria-label="Time"
                  value={time}
                  onChange={(e) => setDue(e.target.value ? `${day || inDays(0)}T${e.target.value}` : day || null)}
                  className={FIELD}
                />
              </div>
              <div className="flex gap-1">
                <select
                  aria-label="Repeat"
                  value={line?.attrs.repeat ?? ''}
                  onChange={(e) => setDue(due ?? inDays(0), e.target.value || null)}
                  className={FIELD}
                >
                  <option value="">Doesn't repeat</option>
                  {REPEATS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {due && (
                  <Tool label="Remove date" onClick={() => pick(null)}>
                    <TrashIcon className={ICON} />
                  </Tool>
                )}
              </div>
            </div>
          </Popover>
        </Group>
        <Group>
          <Tool label="Outdent" onClick={() => chain().liftListItem(listItem).run()}>
            <OutdentIcon className={ICON} />
          </Tool>
          <Tool label="Indent" onClick={() => chain().sinkListItem(listItem).run()}>
            <IndentIcon className={ICON} />
          </Tool>
        </Group>
        <Group>
          <Tool label="Undo" onClick={() => chain().undo().run()}>
            <UndoIcon className={ICON} />
          </Tool>
          <Tool label="Redo" onClick={() => chain().redo().run()}>
            <RedoIcon className={ICON} />
          </Tool>
        </Group>
        <Group>
          <Popover
            side="top"
            open={row === 'styles'}
            onOpenChange={(open) => setRow(open ? 'styles' : null)}
            trigger={
              <Tool label="Text style" active={row === 'styles' || editor.isActive('heading')}>
                <HeadingIcon className={ICON} />
              </Tool>
            }
          >
            <Tool label="Text" active={editor.isActive('paragraph')} onClick={() => style(() => chain().setParagraph().run())}>
              Text
            </Tool>
            {([1, 2, 3] as const).map((level) => (
              <Tool
                key={level}
                label={`Heading ${level}`}
                active={editor.isActive('heading', { level })}
                onClick={() => style(() => chain().setHeading({ level }).run())}
              >
                H{level}
              </Tool>
            ))}
          </Popover>
          <Tool label="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>
            <QuoteIcon className={ICON} />
          </Tool>
          <Tool label="Code block" active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()}>
            <CodeBlockIcon className={ICON} />
          </Tool>
          <Tool label="Divider" onClick={() => chain().setHorizontalRule().run()}>
            <DividerIcon className={ICON} />
          </Tool>
        </Group>
        <Group>
          <Tool label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
            <BoldIcon className={ICON} />
          </Tool>
          <Tool label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
            <ItalicIcon className={ICON} />
          </Tool>
          <Tool label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
            <StrikeIcon className={ICON} />
          </Tool>
          <Tool label="Code" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()}>
            <CodeIcon className={ICON} />
          </Tool>
          <Popover
            side="top"
            open={row === 'link'}
            onOpenChange={openLink}
            className="w-[min(calc(100vw-1rem),28rem)]"
            trigger={
              <Tool label="Link" active={row === 'link' || editor.isActive('link')}>
                <LinkIcon className={ICON} />
              </Tool>
            }
          >
            <form
              className="flex min-w-0 flex-1 items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault()
                applyLink()
              }}
            >
              <input
                aria-label="Link address"
                inputMode="url"
                placeholder="Paste or type a link"
                autoFocus
                value={href}
                onChange={(e) => setHref(e.target.value)}
                className="h-9 min-w-0 flex-1 border-2 border-border bg-bg px-2 outline-none focus:border-accent"
              />
              <Tool label="Apply link" onClick={applyLink}>
                <CheckIcon className={ICON} />
              </Tool>
              {editor.isActive('link') && (
                <Tool
                  label="Remove link"
                  onClick={() => style(() => chain().extendMarkRange('link').unsetLink().run())}
                >
                  <UnlinkIcon className={ICON} />
                </Tool>
              )}
            </form>
          </Popover>
          <Tool label="Highlight" active={editor.isActive('highlight')} onClick={() => chain().toggleHighlight().run()}>
            <HighlightIcon className={ICON} />
          </Tool>
        </Group>
      </div>
    </div>
  )
}

// The border goes around a group of related tools, not each tool.
function Group({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`flex shrink-0 border-2 border-border shadow-[2px_2px_0_var(--border)] ${className}`}>{children}</div>
}

function Tool({ label, active, ...props }: React.ComponentProps<'button'> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Keep the editor focused and the keyboard open while tapping the bar.
      onMouseDown={(e) => e.preventDefault()}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center px-1.5 text-sm font-bold disabled:text-ink-muted ${active ? 'bg-accent text-white' : 'bg-surface'}`}
      {...props}
    />
  )
}
