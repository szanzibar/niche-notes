import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './lib/api'
import { NotebookPage } from './pages/NotebookPage'
import { NotebooksPage } from './pages/NotebooksPage'
import { NotePage } from './pages/NotePage'
import { useAuthStore } from './stores/auth'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => {/* api.me redirects to /auth/login on 401 */})
      .finally(() => setReady(true))
  }, [setUser])

  if (!ready) return null
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthBootstrap>
          <Routes>
            <Route path="/" element={<Navigate to="/notebooks" replace />} />
            <Route path="/notebooks" element={<NotebooksPage />} />
            <Route path="/notebooks/:notebookId" element={<NotebookPage />} />
            <Route path="/notebooks/:notebookId/notes/:noteId" element={<NotePage />} />
          </Routes>
        </AuthBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
