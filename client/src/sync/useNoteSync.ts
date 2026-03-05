import type { Channel } from 'phoenix'
import { Socket } from 'phoenix'
import { useEffect, useRef } from 'react'
import * as Y from 'yjs'

// One shared socket for the whole app lifetime.
let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = new Socket('/socket')
    socket.connect()
  }
  return socket
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

interface NoteSync {
  doc: Y.Doc
}

export function useNoteSync(noteId: string): NoteSync {
  const docRef = useRef<Y.Doc>(null)
  const channelRef = useRef<Channel>(null)

  if (!docRef.current) {
    docRef.current = new Y.Doc()
  }

  useEffect(() => {
    // docRef.current is always set by the time useEffect runs (set in render above)
    const doc = docRef.current as Y.Doc
    const ch = getSocket().channel(`note:${noteId}`)
    channelRef.current = ch

    // On join: server sends all persisted updates — apply each in order.
    ch.join().receive('ok', ({ ydoc_updates }: { ydoc_updates: string[] }) => {
      for (const update of ydoc_updates) {
        Y.applyUpdate(doc, b64ToBytes(update), 'remote')
      }
    })

    // Receive updates broadcast by other clients.
    ch.on('yjs_update', ({ update }: { update: string }) => {
      Y.applyUpdate(doc, b64ToBytes(update), 'remote')
    })

    // Send local edits to the channel (skip updates that originated remotely).
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return
      ch.push('yjs_update', { update: bytesToB64(update) })
    }
    doc.on('update', onUpdate)

    return () => {
      doc.off('update', onUpdate)
      ch.leave()
      channelRef.current = null
    }
  }, [noteId])

  return { doc: docRef.current }
}
