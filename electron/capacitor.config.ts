import type { CapacitorConfig } from '@capacitor/cli'

// Edit url (your server) and allowNavigation (your Pocket ID host) before building the APK.
const config: CapacitorConfig = {
  appId: 'app.nichenotes',
  appName: 'niche-notes',
  webDir: '../server/priv/static',
  server: {
    url: 'https://notes.example.com',
    allowNavigation: ['id.example.com'],
  },
}

export default config
