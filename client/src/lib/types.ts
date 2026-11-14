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
}
