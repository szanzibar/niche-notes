export interface User {
  id: string
  name: string
  email?: string | null
}

export interface Share {
  doc_id: string
  user_id: string
  owner_id: string
}
