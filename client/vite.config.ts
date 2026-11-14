import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The e2e suite runs its own Phoenix on another port.
const phoenix = `localhost:${process.env.PHOENIX_PORT ?? 4000}`

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Our own service worker, so alerts can reuse the app's date logic.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      manifest: {
        name: 'Niche Notes',
        short_name: 'Notes',
        start_url: '/',
        display: 'standalone',
        background_color: '#FAFAF8',
        theme_color: '#111111',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': `http://${phoenix}`,
      '/auth': `http://${phoenix}`,
      '/s/': `http://${phoenix}`,
      '/socket': { target: `ws://${phoenix}`, ws: true },
    },
  },
  build: {
    outDir: '../server/priv/static',
    emptyOutDir: true,
  },
})
