import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { Extension } from '@tiptap/react'
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
  // A line gets an id once someone folds it, which their fold finds it by. A line split from it or pasted starts
  // without one. A copy dragged with Alt or Ctrl keeps it and folds along with its original, which is accepted.
  Extension.create({
    name: 'lineId',
    addGlobalAttributes: () => [
      {
        types: ['taskItem', 'listItem'],
        attributes: { id: { default: null, keepOnSplit: false, parseHTML: () => null, renderHTML: () => ({}) } },
      },
    ],
  }),
  // A line made with Enter starts plain. Every split carries over the stored marks, so we store none before it splits.
  Extension.create({
    name: 'plainNewLine',
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          this.editor.view.dispatch(this.editor.state.tr.setStoredMarks([]))
          return false
        },
      }
    },
  }),
]
