import type { Editor } from '@tiptap/react'
import { useEffect, useReducer, useState } from 'react'
import {
  BoldIcon,
  BulletListIcon,
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
  UndoIcon,
  UnlinkIcon,
} from './icons'
import { listPosition, toggleList } from './lists'
import { Popover } from './Popover'

const ICON = 'h-5 w-5'

export function Toolbar({ editor }: { editor: Editor | null }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  // One box opens above the bar at a time: text styles, or the address of a link.
  const [row, setRow] = useState<'styles' | 'link' | null>(null)
  const [href, setHref] = useState('')
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', force)
    return () => {
      editor.off('transaction', force)
    }
  }, [editor])
  if (!editor) return null

  const { item, list } = listPosition(editor)
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
function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 border-2 border-border shadow-[2px_2px_0_var(--border)]">{children}</div>
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
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center px-1.5 text-sm font-bold ${active ? 'bg-accent text-white' : 'bg-surface'}`}
      {...props}
    />
  )
}
