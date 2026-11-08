import { useEffect, useReducer, useState } from 'react'
import type * as Y from 'yjs'
import { openDoc, store, subscribe } from './store'

const bump = (x: number) => x + 1

interface Observable {
  observeDeep(f: () => void): void
  unobserveDeep(f: () => void): void
}

export function useStore() {
  const [, force] = useReducer(bump, 0)
  useEffect(() => subscribe(force), [])
  return store
}

export function useY(type: Observable | undefined) {
  const [, force] = useReducer(bump, 0)
  useEffect(() => {
    if (!type) return
    type.observeDeep(force)
    return () => type.unobserveDeep(force)
  }, [type])
}

export function useDoc(id: string) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  useEffect(() => {
    let live = true
    void openDoc(id).then((d) => {
      if (live) setDoc(d)
    })
    return () => {
      live = false
    }
  }, [id])
  return doc
}
