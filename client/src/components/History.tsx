import Collaboration from '@tiptap/extension-collaboration'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { api } from '../lib/api'
import { useStore } from '../sync/hooks'
import { titleOf } from '../sync/tree'
import { Button } from './Button'
import { contentExtensions } from './content'

function label(at: string | null) {
  if (!at) return 'Earlier'
  const date = new Date(at)
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (date.toDateString() === new Date().toDateString()) return time
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`
}

// The note at each minute the server's log still tells apart, built here so moving between versions is instant.
// Restore is an ordinary edit, so it syncs to everyone on the note and becomes a version itself.
export function History({
  id,
  doc,
  onClose,
  children,
}: {
  id: string
  doc: Y.Doc
  onClose: () => void
  children: React.ReactNode
}) {
  const online = useStore().online !== false
  const [rows, setRows] = useState<{ seq: number; at: string | null; update: Uint8Array }[]>()
  const [failed, setFailed] = useState(false)
  const [seq, setSeq] = useState<number>()

  useEffect(() => {
    if (!online) return
    let live = true
    api.history(id).then(
      ({ rows }) => {
        if (live)
          setRows(rows.map(([seq, at, update]) => ({ seq, at, update: Uint8Array.from(atob(update), (c) => c.charCodeAt(0)) })))
      },
      () => setFailed(true),
    )
    return () => {
      live = false
    }
  }, [id, online])

  // The last row of each minute, the newest first.
  const versions = useMemo(() => {
    const last = new Map<string, { seq: number; at: string | null }>()
    for (const row of rows ?? []) last.set(row.at?.slice(0, 16) ?? '', row)
    return [...last.values()].reverse()
  }, [rows])
  const chosen = seq ?? versions[0]?.seq

  const version = useMemo(() => {
    const version = new Y.Doc()
    const upto = (rows ?? []).filter((row) => row.seq <= chosen!).map((row) => row.update)
    if (upto.length > 0) Y.applyUpdate(version, Y.mergeUpdates(upto))
    return version
  }, [rows, chosen])

  const editor = useEditor(
    {
      extensions: [...contentExtensions, Collaboration.configure({ document: version, field: 'content' })],
      editable: false,
      editorProps: { attributes: { class: 'editor-body' } },
    },
    [version],
  )

  const restore = () => {
    doc.transact(() => {
      doc.getMap('meta').set('title', version.getMap('meta').get('title') ?? '')
      const content = doc.getXmlFragment('content')
      content.delete(0, content.length)
      content.insert(
        0,
        version
          .getXmlFragment('content')
          .toArray()
          .map((child) => child.clone() as Y.XmlElement | Y.XmlText),
      )
    })
    onClose()
  }

  return (
    <>
      <header className="note-header flex items-center gap-2 border-b-2 border-border bg-accent px-3 py-2 text-on-accent">
        {children}
        <span data-title className="min-w-0 flex-1 truncate text-lg font-bold">
          {rows ? (version.getMap('meta').get('title') as string | undefined) || 'Untitled' : titleOf(id)}
        </span>
        <Button disabled={chosen == null} onClick={restore}>
          Restore
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </header>
      {rows ? (
        <>
          <div role="group" aria-label="Versions" className="flex shrink-0 overflow-x-auto border-b-2 border-border bg-surface">
            {versions.map((v) => (
              <Button key={v.seq} aria-pressed={v.seq === chosen} onClick={() => setSeq(v.seq)}>
                {label(v.at)}
              </Button>
            ))}
          </div>
          {/* Sunken and muted, as a note in the trash: readable, clearly not for writing. */}
          <EditorContent editor={editor} className="flex-1 overflow-y-auto bg-sunken text-ink-muted" />
        </>
      ) : (
        (failed || !online) && <p className="m-auto text-ink-muted">History needs a connection.</p>
      )}
    </>
  )
}
