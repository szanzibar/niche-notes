export interface User {
  id: string
  name: string
  email?: string | null
  // Came in through a note's link, without an account.
  guest?: boolean
}

export interface Share {
  doc_id: string
  user_id: string
  owner_id: string
  read_only: boolean
}

// Anyone who opens a note's link gets the note, and `visitors` are who did, with when they first came.
export interface Link {
  token: string
  read_only: boolean
  at: string
  visitors: { name: string; at: string }[]
}
