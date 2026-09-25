// The only place that calls the backend.

const TOKEN_KEY = 'gs_token'
const PHONE_KEY = 'gs_phone'
const PIN_KEY = 'gs_operator_pin'
const RACK_KEY = 'gs_last_rack'

function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* private mode: the session simply is not remembered */ }
}

export const session = {
  token: () => safeGet(TOKEN_KEY),
  phone: () => safeGet(PHONE_KEY),
  save: (token, phone) => { safeSet(TOKEN_KEY, token); safeSet(PHONE_KEY, phone) },
  clear: () => { safeSet(TOKEN_KEY, null); safeSet(PHONE_KEY, null) },
  pin: () => safeGet(PIN_KEY) || '',
  setPin: (pin) => safeSet(PIN_KEY, pin),
  // Backup return needs a rack QR scanned in the last 5 minutes (kept in this browser).
  rememberRack: (station) => safeSet(RACK_KEY, JSON.stringify({ station, at: Date.now() })),
  recentRack: () => {
    try {
      const r = JSON.parse(safeGet(RACK_KEY) || 'null')
      return r && Date.now() - r.at < 5 * 60 * 1000 ? r.station : null
    } catch { return null }
  },
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = session.token()
  if (token) headers.Authorization = `Bearer ${token}`
  const pin = session.pin()
  if (pin) headers['X-Operator-Pin'] = pin
  let res
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError('Réseau indisponible. Réessaie dans un instant.', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError((data && data.detail) || `Erreur ${res.status}`, res.status)
  return data
}

const get = (path) => request('GET', path)
const post = (path, body = {}) => request('POST', path, body)

export const api = {
  // stations
  station: (id) => get(`/api/stations/${encodeURIComponent(id)}`),
  // customers
  sendOtp: (phone) => post('/api/otp', { phone }),
  verifyOtp: (phone, code, referralCode) =>
    post('/api/otp/verify', { phone, code, referral_code: referralCode || null }),
  addCard: (cardNumber) => post('/api/card-holds', { card_number: cardNumber }),
  me: () => get('/api/me'),
  sms: (phone) => get(`/api/sms?phone=${encodeURIComponent(phone)}`),
  // rentals
  rent: (station, packCode) => post('/api/rentals', { station, pack_code: packCode || null }),
  currentRental: () => get('/api/rentals/current'),
  cancelRental: (id) => post(`/api/rentals/${id}/cancel`),
  manualReturn: (id, rackStation, boardQr) =>
    post(`/api/rentals/${id}/manual-return`, { rack_station: rackStation, board_qr: boardQr }),
  // photos and damage
  uploadPhoto: (rentalId, boardQr, imageBase64, damageZone) =>
    post('/api/photos', { rental_id: rentalId, board_qr: boardQr, image_base64: imageBase64, damage_zone: damageZone || null }),
  reportDamage: (boardId, zone) => post('/api/damage-reports', { board_id: boardId, zone }),
  reviewDamage: (id, decision, role) => post(`/api/damage-reports/${id}/review`, { decision, role }),
  // passport
  passport: (board) => get(`/api/boards/${encodeURIComponent(board)}/passport`),
  // operator
  fleet: () => get('/api/fleet'),
  confirmLoss: (board, role) => post(`/api/boards/${board}/confirm-loss`, { role }),
  backInService: (board, role) => post(`/api/boards/${board}/back-in-service`, { role }),
  resolveAlert: (id) => post(`/api/alerts/${id}/resolve`),
  resetDemo: () => post('/api/fleet/reset'),
  // partner
  partnerDashboard: (id) => get(`/api/partners/${encodeURIComponent(id)}/dashboard`),
}
