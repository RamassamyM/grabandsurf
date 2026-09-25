import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The landing site runs on its own ports: 5180 in development, 4180 for the built preview.
// It never calls the backend; links to the rental app use VITE_APP_URL.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, strictPort: true, host: true },
  preview: { port: 4180, strictPort: true, host: true },
})
