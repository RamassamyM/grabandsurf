import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useT } from '../i18n.jsx'

export function Logo({ small = false }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/favicon.svg" alt="" className={small ? 'h-7 w-7' : 'h-10 w-10'} />
      <span className={`font-display font-bold tracking-tight text-ocean-700 ${small ? 'text-lg' : 'text-3xl'}`}>
        Grab<span className="text-cork-500">&amp;</span>Surf
      </span>
    </div>
  )
}

export function Card({ children, className = '', tone = 'white' }) {
  const tones = {
    white: 'bg-white',
    ocean: 'bg-ocean-500 text-white',
    sand: 'bg-sand-50',
    coral: 'bg-coral-500 text-white',
  }
  return <div className={`rounded-2xl p-4 shadow-card ${tones[tone]} ${className}`}>{children}</div>
}

export function Button({ children, variant = 'primary', className = '', busy = false, ...props }) {
  const variants = {
    primary: 'bg-ocean-500 text-white hover:bg-ocean-600 active:bg-ocean-700',
    cork: 'bg-cork-500 text-white hover:bg-cork-600',
    ghost: 'bg-transparent text-ocean-700 hover:bg-ocean-50 border border-ocean-100',
    danger: 'bg-coral-500 text-white hover:bg-coral-600',
    light: 'bg-white/15 text-white hover:bg-white/25',
  }
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition
        disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  )
}

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="rounded-xl bg-coral-400/15 px-4 py-3 text-sm font-medium text-coral-600">
      {error}
    </p>
  )
}

const LOCALES = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }

export function Money({ cents }) {
  const { lang } = useT()
  const text = new Intl.NumberFormat(LOCALES[lang] || 'fr-FR', { style: 'currency', currency: 'EUR' })
    .format(Number(cents || 0) / 100)
  return <span className="tabular-nums">{text}</span>
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`
}

const STATUS_STYLES = {
  at_rack: 'bg-ocean-100 text-ocean-700',
  away_from_home: 'bg-cork-300/40 text-cork-700',
  at_sea: 'bg-sky-100 text-sky-800',
  unauthorized: 'bg-coral-500 text-white',
  not_returned: 'bg-coral-400/30 text-coral-600',
  workshop: 'bg-amber-100 text-amber-800',
  lost: 'bg-ocean-900 text-white',
  sold: 'bg-ocean-900 text-white',
}

export function StatusBadge({ status, label }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] || 'bg-sand-200'}`}>
      {label || status}
    </span>
  )
}

export function TxLink({ hash, url }) {
  const { t } = useT()
  if (!hash) return <span className="text-xs text-ocean-700/60">{t('pending_write')}</span>
  const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`
  if (!url) return <span className="font-mono text-xs text-ocean-700/70" title="Simulation">{short} ({t('simulation')})</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-ocean-500 underline decoration-dotted">
      {short} ↗
    </a>
  )
}

export function Spinner({ label = 'Chargement' }) {
  return (
    <div className="flex items-center gap-3 py-8 text-ocean-700" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-ocean-500 border-t-transparent" />
      {label}
    </div>
  )
}

// Poll a loader every `ms` milliseconds (2 s refresh instead of WebSockets).
export function usePoll(loader, ms = 2000, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const alive = useRef(true)
  const reload = async () => {
    try {
      const d = await loader()
      if (alive.current) { setData(d); setError(null) }
    } catch (e) {
      if (alive.current) setError(e)
    }
  }
  useEffect(() => {
    alive.current = true
    reload()
    const id = setInterval(reload, ms)
    return () => { alive.current = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return { data, error, reload }
}

export function SmsInbox({ phone }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const { data } = usePoll(() => (phone ? api.sms(phone) : Promise.resolve([])), 2000, [phone])
  const count = data ? data.length : 0
  if (!phone) return null
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm">
      {open && (
        <Card className="mb-2 max-h-[60vh] overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold">{t('sms_received')}</div>
            <span className="text-xs text-ocean-700/60">{phone}</span>
          </div>
          {count === 0 && <p className="text-sm text-ocean-700/70">{t('sms_none')}</p>}
          <ul className="space-y-2">
            {(data || []).map((m) => (
              <li key={m.id} className="rounded-xl rounded-tl-sm bg-sand-100 px-3 py-2 text-sm">
                {m.text}
                <SmsStatus status={m.status} error={m.error} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto flex items-center gap-2 rounded-full bg-ocean-900 px-4 py-3 text-sm font-semibold text-white shadow-card"
      >
        <span aria-hidden>✉</span> {t('sms_demo')}
        {count > 0 && <span className="rounded-full bg-cork-400 px-2 text-xs">{count}</span>}
      </button>
    </div>
  )
}

export function SmsStatus({ status, error }) {
  const { t } = useT()
  if (!status || status === 'demo') return null
  const styles = { queued: 'text-ocean-700/60', sent: 'text-ocean-500', failed: 'text-coral-600' }
  return (
    <div className={`mt-1 text-[11px] font-medium ${styles[status] || ''}`} title={error || ''}>
      {t(`sms_${status}`)}{status === 'failed' && error ? ` : ${error}` : ''}
    </div>
  )
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
