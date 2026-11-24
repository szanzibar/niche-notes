import type { Node } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { done, foldedLines, foldsHolding } from './lists'

interface Find {
  query: string
  current: number
  matches: { from: number; to: number }[]
}
export const find = new PluginKey<Find>('find')

// Plain text in any case, outside the lines the note hides and the lines this person folded.
function matchesIn(doc: Node, query: string, hiding: boolean, folded: Set<string>) {
  const matches: Find['matches'] = []
  if (!query) return matches
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  doc.descendants((node, pos) => {
    if (hiding && done(node)) return false
    if (!node.isTextblock) return
    if (foldsHolding(doc.resolve(pos + 1), folded).length) return false
    // Each thing that isn't text counts as one letter, so a match sits where the note has it.
    const text = node.textBetween(0, node.content.size, undefined, '￼')
    for (const { index, 0: match } of text.matchAll(pattern)) {
      matches.push({ from: pos + 1 + index, to: pos + 1 + index + match.length })
    }
    return false
  })
  return matches
}

export const FindInNote = (hiding: () => boolean) =>
  Extension.create({
    name: 'findInNote',
    addProseMirrorPlugins: () => [
      new Plugin<Find>({
        key: find,
        state: {
          init: () => ({ query: '', current: 0, matches: [] }),
          apply: (tr, was, _old, state) => {
            const meta = tr.getMeta(find) as { query: string } | { step: 1 | -1 } | undefined
            const count = was.matches.length
            if (meta && 'step' in meta) return { ...was, current: count && (was.current + meta.step + count) % count }
            if (!meta && !tr.docChanged && !tr.getMeta(foldedLines)) return was
            const query = meta ? meta.query : was.query
            const matches = matchesIn(state.doc, query, hiding(), foldedLines.getState(state)!)
            // Someone else's edit redraws the whole note, so the current match keeps its number rather than its place.
            return { query, matches, current: meta ? 0 : Math.max(Math.min(was.current, matches.length - 1), 0) }
          },
        },
        props: {
          decorations: (state) => {
            const { matches, current } = find.getState(state)!
            return DecorationSet.create(
              state.doc,
              matches.map(({ from, to }, i) => Decoration.inline(from, to, { class: i === current ? 'find-current' : 'find-match' })),
            )
          },
        },
        view: () => ({
          update: (view, prev) => {
            const now = find.getState(view.state)!
            const was = find.getState(prev)!
            if (now.query !== was.query || now.current !== was.current) {
              view.dom.querySelector('.find-current')?.scrollIntoView({ block: 'nearest' })
            }
          },
        }),
      }),
    ],
  })
