import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Lock, RotateCw, Smartphone } from 'lucide-react'
import { api, session } from '@/api.js'
import { Logo, usePoll } from '@/components/common.jsx'
import { LangSwitch, useT } from '@/i18n.jsx'

const DEFAULT_RACKS = ['A', 'B', 'C'].map((id) => ({ id, path: `/s/${id}`, label: `Rack ${id}` }))
const DEFAULT_BOARDS = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `korko-0${n}`, path: `/p/korko-0${n}`, label: `korko-0${n}` }))
const SEEN_KEY = 'gs_demo_seen_sms'

// Demo: the customer pages inside a phone, with a browser, a camera that "scans" fake QR codes and the texts received.
export default function DemoPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [url, setUrl] = useState(() => safePath(params.get('url')) || '/s/A')
  const [shown, setShown] = useState(url)  // address bar, follows the navigation inside the frame
  const [app, setApp] = useState('browser')
  const [phone, setPhone] = useState(session.phone())
  useEffect(() => {
    const id = setInterval(() => setPhone(session.phone()), 1000)  // same origin: the frame shares localStorage
    return () => clearInterval(id)
  }, [])
  const sms = usePoll(() => (phone ? api.sms(phone) : Promise.resolve([])), 2000, [phone])
  const [seen, setSeen] = useState(() => Number(readKey(SEEN_KEY) || 0))
  const count = sms.data ? sms.data.length : 0
  const unread = Math.max(0, count - seen)
  useEffect(() => {
    if (app === 'messages' && count !== seen) { setSeen(count); writeKey(SEEN_KEY, String(count)) }
  }, [app, count, seen])

  const open = (path) => { setUrl(path); setShown(path); setApp('browser') }
  const exit = () => navigate(shown)

  return (
    <div className="min-h-dvh bg-navy px-4 py-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <Link to="/" aria-label="Grab&Surf"><Logo className="h-12" /></Link>
        <div className="flex items-center gap-3">
          <LangSwitch dark />
          <PhoneSwitchButton on onClick={exit} />
        </div>
      </div>
      <p className="mx-auto mt-3 max-w-5xl text-center font-script text-2xl text-sun">{t('demo_title')}</p>

      <div className="mt-4 flex justify-center">
        <div className="relative h-[780px] max-h-[calc(100dvh-8rem)] min-h-[560px] w-[380px] max-w-full rounded-[3rem] border-[12px] border-black bg-black shadow-[0_30px_80px_-20px_rgba(27,168,200,.45)]">
          <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black" />
          <div className="flex h-full flex-col overflow-hidden rounded-[2.2rem] bg-white">
            <StatusBar />
            <div className="relative min-h-0 flex-1">
              <div className={`absolute inset-0 flex flex-col ${app === 'browser' ? '' : 'invisible'}`}>
                <Browser url={url} shown={shown} setShown={setShown} />
              </div>
              {app === 'camera' && <Camera onScan={open} />}
              {app === 'messages' && <Messages phone={phone} list={sms.data || []} onOpen={open} />}
            </div>
            <BottomBar app={app} setApp={setApp} unread={unread} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function PhoneSwitchButton({ on = false, onClick }) {
  const { t } = useT()
  return (
    <button onClick={onClick} role="switch" aria-checked={on}
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold text-white ring-1 ring-white/15 ${on ? 'bg-white/10 hover:bg-white/20' : 'bg-navy shadow-lg hover:bg-navy-800'}`}>
      <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-sun' : 'bg-white/30'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <Smartphone className="h-4 w-4" /> {t('demo_phone')}
    </button>
  )
}

function safePath(p) {
  return p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/demo') ? p : null
}
function readKey(k) { try { return localStorage.getItem(k) } catch { return null } }
function writeKey(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000)  // display only, never business logic
    return () => clearInterval(id)
  }, [])
  const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return (
    <div className="flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-xs font-bold text-navy">
      <span>{hh}</span>
      <span className="flex items-center gap-1" aria-hidden>▂▄▆ <span className="rounded-sm border border-navy px-1 text-[9px]">87</span></span>
    </div>
  )
}

function Browser({ url, shown, setShown }) {
  const frame = useRef(null)
  const [key, setKey] = useState(0)
  useEffect(() => { setKey((k) => k + 1) }, [url])
  const onLoad = () => {
    try {
      const loc = frame.current.contentWindow.location
      setShown(loc.pathname + loc.search)
    } catch { /* another origin: keep the last address */ }
  }
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted px-3 py-2">
        <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1 truncate rounded-full bg-white px-3 py-1 font-mono text-[11px] text-muted-foreground shadow-inner">
          {window.location.host}{shown}
        </div>
        <button className="text-muted-foreground" aria-label="Reload" onClick={() => setKey((k) => k + 1)}><RotateCw className="h-3.5 w-3.5" /></button>
      </div>
      <iframe key={key} ref={frame} src={url} title="Grab&Surf" onLoad={onLoad} className="min-h-0 w-full flex-1 border-0"
        allow="camera; clipboard-write" />
    </>
  )
}

function Camera({ onScan }) {
  const { t } = useT()
  const codes = usePoll(() => api.qrCodes().catch(() => null), 60000, [])
  const racks = codes.data?.racks?.length ? codes.data.racks : DEFAULT_RACKS
  const boards = codes.data?.boards?.length ? codes.data.boards : DEFAULT_BOARDS
  const [scanning, setScanning] = useState(null)
  const scan = (item) => {
    setScanning(item.id)
    setTimeout(() => { setScanning(null); onScan(item.path) }, 700)
  }
  return (
    <div className="absolute inset-0 bg-navy text-white">
    <div className="absolute inset-0 overflow-y-auto p-4">
      <p className="text-center text-sm text-white/80">{t('demo_camera_hint')}</p>
      <h3 className="mt-3 text-xs uppercase tracking-widest text-white/60">{t('demo_racks')}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {racks.map((r) => <FakeQr key={r.id} item={r} label={r.label || `Rack ${r.id}`} busy={scanning === r.id} onClick={() => scan(r)} />)}
      </div>
      <h3 className="mt-4 text-xs uppercase tracking-widest text-white/60">{t('demo_boards')}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {boards.map((b) => <FakeQr key={b.id} item={b} label={b.id} busy={scanning === b.id} onClick={() => scan(b)} />)}
      </div>
    </div>
      {scanning && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/70 px-4 py-2 text-sm">{t('demo_scanning')}</span>
        </div>
      )}
    </div>
  )
}

function FakeQr({ item, label, busy, onClick }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    QRCode.toDataURL(window.location.origin + item.path, { margin: 1, width: 160, color: { dark: '#0B2533', light: '#FFFFFF' } })
      .then(setSrc).catch(() => setSrc(null))
  }, [item.path])
  return (
    <button onClick={onClick}
      className={`rounded-xl bg-white p-1.5 text-center text-navy transition active:scale-95 ${busy ? 'ring-4 ring-sun' : ''}`}>
      {src ? <img src={src} alt={label} className="w-full" /> : <div className="aspect-square" />}
      <div className="truncate font-mono text-[10px] font-semibold">{label}</div>
    </button>
  )
}

// Absolute links, or app paths when PUBLIC_BASE_URL is not set (demo).
const LINK = /(https?:\/\/[^\s]+|\/(?:s|p|claim)\/[^\s]+)/g
const IS_LINK = /^(https?:\/\/|\/(?:s|p|claim)\/)/

function Messages({ phone, list, onOpen }) {
  const { t } = useT()
  const bottom = useRef(null)
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [list.length])
  const ordered = [...list].sort((a, b) => a.id - b.id)
  const follow = (href) => {
    try {
      const u = new URL(href, window.location.origin)
      if (u.origin === window.location.origin || /localhost|127\.0\.0\.1/.test(u.host)) return onOpen(u.pathname + u.search)
    } catch { /* not a URL */ }
    window.open(href, '_blank', 'noreferrer')
  }
  return (
    <div className="absolute inset-0 flex flex-col bg-muted">
      <div className="shrink-0 border-b bg-white py-2 text-center">
        <div className="mx-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-navy"><img src="/favicon.png" alt="" className="h-7 w-7" /></div>
        <div className="text-xs font-bold">{t('demo_sender')}</div>
        {phone && <div className="text-[10px] text-muted-foreground">{phone}</div>}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {!ordered.length && <p className="mt-8 px-4 text-center text-sm text-muted-foreground">{t('demo_no_sms')}</p>}
        {ordered.map((m) => (
          <div key={m.id} className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm shadow-sm">
            {String(m.text).split(LINK).map((part, i) => (IS_LINK.test(part) ? (
              <button key={i} className="break-all text-left font-bold text-ocean-700 underline" onClick={() => follow(part)}>{part}</button>
            ) : <span key={i}>{part}</span>))}
            {m.status && m.status !== 'demo' && <div className="mt-1 text-[10px] text-muted-foreground">{t(`sms_${m.status}`)}</div>}
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  )
}

function BottomBar({ app, setApp, unread }) {
  const { t } = useT()
  const items = [
    ['browser', t('demo_browser'), <ChromeIcon key="c" />],
    ['camera', t('demo_camera'), <CameraIcon key="p" />],
    ['messages', t('demo_messages'), <MessagesIcon key="m" />],
  ]
  return (
    <nav className="flex shrink-0 items-center justify-around border-t bg-white/95 px-4 pb-4 pt-2">
      {items.map(([id, label, icon]) => (
        <button key={id} onClick={() => setApp(id)} aria-label={label} aria-pressed={app === id}
          className={`relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-[10px] ${app === id ? 'bg-muted font-bold text-navy' : 'text-muted-foreground'}`}>
          {icon}
          {label}
          {id === 'messages' && unread > 0 && (
            <span className="absolute -top-1 right-1 min-w-[18px] rounded-full bg-coral px-1 text-[10px] font-bold text-white">{unread}</span>
          )}
        </button>
      ))}
    </nav>
  )
}

function ChromeIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#DB4437" />
      <path d="M24 24 L43.05 13 A22 22 0 0 1 24 46 Z" fill="#FFCD40" />
      <path d="M24 24 L24 46 A22 22 0 0 1 4.95 13 Z" fill="#0F9D58" />
      <circle cx="24" cy="24" r="10" fill="#fff" />
      <circle cx="24" cy="24" r="7.5" fill="#4285F4" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#3A3A3C" />
      <rect x="9" y="15" width="30" height="21" rx="4" fill="#E5E5EA" />
      <rect x="18" y="11" width="12" height="6" rx="2" fill="#E5E5EA" />
      <circle cx="24" cy="25.5" r="7" fill="#3A3A3C" />
      <circle cx="24" cy="25.5" r="4.5" fill="#8E8E93" />
    </svg>
  )
}

function MessagesIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden>
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#34C759" />
      <path d="M24 12c-8.3 0-15 5.4-15 12 0 3.7 2.1 7 5.4 9.2L13 38l5.8-2.7c1.6.5 3.4.7 5.2.7 8.3 0 15-5.4 15-12s-6.7-12-15-12z" fill="#fff" />
    </svg>
  )
}
