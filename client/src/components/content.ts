import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem } from './lists'

// What a note's content can hold, so an import builds the same nodes the editor reads.
export const contentExtensions = [
  // A tap on a link places the cursor to edit it, and the toolbar shows the address to open it.
  StarterKit.configure({
    undoRedo: false,
    dropcursor: { color: 'var(--accent)', width: 3 },
    link: { openOnClick: false },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
]
