import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development Vite forwards the API and the station protocol to the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:9000',
      '/evenements': 'http://localhost:9000',
    },
  },
})
