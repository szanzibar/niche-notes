import type { Editor } from '@tiptap/react'
import { useEffect, useReducer, useState } from 'react'
import {
  BoldIcon,
  BulletListIcon,
  ChecklistIcon,
  CodeIcon,
  HeadingIcon,
  HighlightIcon,
  IndentIcon,
  ItalicIcon,
  LinkIcon,
  MoveDownIcon,
  MoveUpIcon,
  NumberedListIcon,
  OutdentIcon,
  RedoIcon,
  StrikeIcon,
  UndoIcon,
} from './icons'
import { listPosition, moveLine, toggleList } from './lists'

const ICON = 'h-5 w-5'

export function Toolbar({ editor }: { editor: Editor | null }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [styles, setStyles] = useState(false)
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
  const chain = () => editor.chain().focus()
  const style = (apply: () => void) => {
    apply()
    setStyles(false)
  }
  const link = () => {
    if (editor.isActive('link')) return chain().extendMarkRange('link').unsetLink().run()
    const typed = window.prompt('Link')?.trim()
    if (!typed) return
    // A bare address like example.com would otherwise link to a page on this site.
    const href = /^[a-z][a-z\d+.-]*:/i.test(typed) ? typed : `https://${typed}`
    if (!editor.state.selection.empty) return chain().setLink({ href }).run()
    chain()
      .insertContent({ type: 'text', text: typed, marks: [{ type: 'link', attrs: { href } }] })
      .run()
  }

  return (
    <div className="shrink-0 border-t-2 border-border bg-surface">
      {styles && (
        <div className="flex overflow-x-auto px-2 pt-2">
          <Group>
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
            <Tool label="Code block" active={editor.isActive('codeBlock')} onClick={() => style(() => chain().setCodeBlock().run())}>
              Code
            </Tool>
          </Group>
        </div>
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
          <Tool label="Move up" onClick={() => moveLine(editor, -1)}>
            <MoveUpIcon className={ICON} />
          </Tool>
          <Tool label="Move down" onClick={() => moveLine(editor, 1)}>
            <MoveDownIcon className={ICON} />
          </Tool>
        </Group>
        <Group>
          <Tool
            label="Text style"
            active={styles || editor.isActive('heading') || editor.isActive('codeBlock')}
            onClick={() => setStyles(!styles)}
          >
            <HeadingIcon className={ICON} />
          </Tool>
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
          <Tool label="Link" active={editor.isActive('link')} onClick={link}>
            <LinkIcon className={ICON} />
          </Tool>
          <Tool label="Highlight" active={editor.isActive('highlight')} onClick={() => chain().toggleHighlight().run()}>
            <HighlightIcon className={ICON} />
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
      </div>
    </div>
  )
}

// The border goes around a group of related tools, not each tool.
function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 border-2 border-border shadow-[2px_2px_0_var(--border)]">{children}</div>
}

function Tool({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Keep the editor focused and the keyboard open while tapping the bar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-9 min-w-9 shrink-0 items-center justify-center px-1.5 text-sm font-bold ${active ? 'bg-accent text-white' : 'bg-surface'}`}
    >
      {children}
    </button>
  )
}
