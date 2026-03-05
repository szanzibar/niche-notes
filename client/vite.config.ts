import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/auth': 'http://localhost:4000',
      '/socket': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: {
    outDir: '../server/priv/static',
    emptyOutDir: true,
  },
})
