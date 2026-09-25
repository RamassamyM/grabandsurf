import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development Vite forwards the API and the station protocol to the backend.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:9000',
      '/evenements': 'http://localhost:9000',
    },
  },
})
