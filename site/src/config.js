// Where the rental app lives (frontend/). The site itself never calls the backend.
const APP_URL = (import.meta.env.VITE_APP_URL || 'http://localhost:5173').replace(/\/+$/, '')

export function appUrl(path) {
  return `${APP_URL}${path}`
}
