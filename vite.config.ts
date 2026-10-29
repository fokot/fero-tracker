import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { offlineShell } from './build/offline'

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: {
    port: 5173,
    host: true,
    strictPort: true
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: { app: 'index.html', docs: 'docs/index.html' }
    }
  }
})
