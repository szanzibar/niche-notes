import type { Editor } from '@tiptap/react'
import type { ListType } from './lists'
import { useEffect, useReducer } from 'react'
import { listPosition, toggleList } from './lists'

export function Toolbar({ editor }: { editor: Editor | null }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
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
  const toggle = (type: ListType) => toggleList(editor, type)

  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-t-2 border-border bg-surface px-2 py-2">
      <Tool label="Checklist" active={list === 'taskList'} onClick={() => toggle('taskList')}>
        ☑
      </Tool>
      <Tool label="Bullet list" active={list === 'bulletList'} onClick={() => toggle('bulletList')}>
        •
      </Tool>
      <Tool label="Numbered list" active={list === 'orderedList'} onClick={() => toggle('orderedList')}>
        1.
      </Tool>
      <Tool label="Outdent" onClick={() => chain().liftListItem(listItem).run()}>
        ⇤
      </Tool>
      <Tool label="Indent" onClick={() => chain().sinkListItem(listItem).run()}>
        ⇥
      </Tool>
      <Tool label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        H1
      </Tool>
      <Tool label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        H2
      </Tool>
      <Tool label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
        B
      </Tool>
      <Tool label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
        <i>I</i>
      </Tool>
      <Tool label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Tool>
      <Tool label="Undo" onClick={() => chain().undo().run()}>
        ↶
      </Tool>
      <Tool label="Redo" onClick={() => chain().redo().run()}>
        ↷
      </Tool>
    </div>
  )
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
      className={`h-11 min-w-11 shrink-0 border-2 border-border px-2 font-bold ${active ? 'bg-accent text-white' : 'bg-surface'}`}
    >
      {children}
    </button>
  )
}
