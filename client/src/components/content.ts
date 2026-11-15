import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem } from './lists'

// What a note's content can hold, so an import builds the same nodes the editor reads.
export const contentExtensions = [
  // A tap on a link places the cursor to edit it, and a box under it shows the address to open it.
  StarterKit.configure({
    undoRedo: false,
    dropcursor: { color: 'var(--accent-ink)', width: 3 },
    link: { openOnClick: false },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  // A wide table scrolls inside its wrapper. Cells hold plain lines, so checkboxes and their dates stay out of tables.
  Table.configure({ renderWrapper: true }),
  TableRow,
  TableHeader.extend({ content: 'paragraph+' }),
  TableCell.extend({ content: 'paragraph+' }),
]
