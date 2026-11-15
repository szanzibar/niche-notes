import { Selection } from '@tiptap/pm/state'
import { Extension } from '@tiptap/react'

// Return walks across a row like a form, so a phone keyboard fills a table. The last cell adds a row, and Return in
// an empty last row removes it and leaves the table, the way Return on an empty line leaves a list.
export const TableEnter = Extension.create({
  name: 'tableEnter',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { editor } = this
        if (!editor.isActive('table')) return false
        const { $from } = editor.state.selection
        const depth = $from.depth - 3
        const table = $from.node(depth)
        const last = $from.index(depth) === table.childCount - 1
        if (last && table.childCount > 1 && !$from.node(depth + 1).textContent) {
          const start = $from.before(depth)
          return editor
            .chain()
            .deleteRow()
            .command(({ tr }) => {
              tr.setSelection(Selection.near(tr.doc.resolve(start + tr.doc.nodeAt(start)!.nodeSize), 1))
              return true
            })
            .run()
        }
        return editor.commands.goToNextCell() || editor.chain().addRowAfter().goToNextCell().run()
      },
    }
  },
})
