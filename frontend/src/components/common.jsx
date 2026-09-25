import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ExternalLink, Loader2, MessageCircle, X } from 'lucide-react'
import { api, isEmbedded } from '@/api.js'
import { useT } from '@/i18n.jsx'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

export function Logo({ className = '' }) {
  return <img src="/logo.png" alt="Grab&Surf" className={cn('h-10 w-auto select-none', className)} draggable={false} />
}

// A short handwritten accent, as in the deck ("Et toi, pas de planche.").
export function Script({ children, className = '' }) {
  return <span className={cn('font-script font-normal text-sun', className)}>{children}</span>
}

export function ErrorNote({ error, className = '' }) {
  if (!error) return null
  return (
    <Alert variant="destructive" role="alert" className={cn('rounded-xl border-coral/30 bg-coral-50', className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
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

const STATUS_VARIANTS = {
  at_rack: 'ocean',
  away_from_home: 'sun',
  at_sea: 'ocean',
  unauthorized: 'destructive',
  not_returned: 'coral',
  workshop: 'sun',
  lost: 'navy',
  sold: 'navy',
}

export function StatusBadge({ status, label, className = '' }) {
  return <Badge variant={STATUS_VARIANTS[status] || 'muted'} className={className}>{label || status}</Badge>
}

export function TxLink({ hash, url }) {
  const { t } = useT()
  if (!hash) return <span className="text-xs text-muted-foreground">{t('pending_write')}</span>
  const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`
  if (!url) return <span className="font-mono text-xs text-muted-foreground" title="Simulation">{short} ({t('simulation')})</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-ocean-700 hover:underline">
      {short} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

export function Spinner({ label = 'Chargement', className = '' }) {
  return (
    <div className={cn('flex items-center justify-center gap-3 py-10 text-muted-foreground', className)} aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-ocean" /> {label}
    </div>
  )
}

// Key figure tile used by the dashboards and the passport.
export function Stat({ value, label, icon: Icon, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-card',
    navy: 'bg-navy text-white border-navy',
    sun: 'bg-sun text-navy border-sun',
  }
  return (
    <div className={cn('rounded-2xl border p-4 shadow-soft', tones[tone], className)}>
      <div className={cn('flex items-center gap-2 text-xs font-bold uppercase tracking-wider',
        tone === 'default' ? 'text-muted-foreground' : 'opacity-80')}>
        {Icon && <Icon className="h-4 w-4" />} {label}
      </div>
      <div className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight">{value}</div>
    </div>
  )
}

// Icon in a colored circle, as in the deck.
export function IconBubble({ icon: Icon, tone = 'navy', className = '' }) {
  const tones = {
    navy: 'bg-navy text-sun',
    ocean: 'bg-ocean text-navy',
    sun: 'bg-sun text-navy',
    foam: 'bg-foam text-ocean-700',
    coral: 'bg-coral-50 text-coral',
  }
  return (
    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tones[tone], className)}>
      <Icon className="h-5 w-5" />
    </span>
  )
}

// Confirmation dialog, optionally with a text field (replaces window.confirm / window.prompt).
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirmer', cancelLabel = 'Annuler',
  destructive = false, input = null, onConfirm,
}) {
  const [value, setValue] = useState(input?.initial || '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setValue(input?.initial || '') }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = async () => {
    setBusy(true)
    try { await onConfirm(value) } finally { setBusy(false); onOpenChange(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {input && (
          <textarea className="min-h-[80px] w-full rounded-xl border border-input bg-white px-3.5 py-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={input.label} value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} disabled={busy || Boolean(input && !value.trim())} onClick={confirm}>
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

// Demo text messages, shown as soon as a code has been sent to the number.
export function SmsInbox({ phone }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const { data } = usePoll(() => (phone ? api.sms(phone) : Promise.resolve([])), 2000, [phone])
  const list = [...(data || [])].sort((a, b) => a.id - b.id)
  const count = list.length
  const bottom = useRef(null)
  useEffect(() => { if (open) { setSeen(count); bottom.current?.scrollIntoView({ block: 'end' }) } }, [open, count])
  if (!phone || isEmbedded()) return null  // inside the phone mockup, texts show in the Messages app
  const unread = Math.max(0, count - seen)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[calc(100%-2rem)] max-w-sm flex-col items-end gap-2 [&>*]:pointer-events-auto">
      {open && (
        <div className="w-full overflow-hidden rounded-2xl border bg-card shadow-2xl animate-in fade-in-0 slide-in-from-bottom-2">
          <div className="flex items-center justify-between bg-navy px-4 py-3 text-white">
            <div>
              <div className="text-sm font-bold">{t('sms_received')}</div>
              <div className="text-xs text-white/60">{phone}</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1 hover:bg-white/10" aria-label={t('scan_close')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto bg-muted/60 p-3">
            {count === 0 && <p className="py-4 text-center text-sm text-muted-foreground">{t('sms_none')}</p>}
            {list.map((m) => (
              <div key={m.id} className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm shadow-sm">
                <LinkedText text={m.text} />
                <SmsStatus status={m.status} error={m.error} />
              </div>
            ))}
            <div ref={bottom} />
          </div>
        </div>
      )}
      <Button onClick={() => setOpen(!open)} className="h-12 rounded-full pl-4 pr-5 shadow-lg">
        <MessageCircle className="!h-5 !w-5" /> {t('sms_demo')}
        {unread > 0 && <span className="ml-1 rounded-full bg-sun px-2 text-xs text-navy">{unread}</span>}
      </Button>
    </div>
  )
}

const LINK = /(https?:\/\/[^\s]+|\/(?:s|p|claim)\/[^\s]+)/g

// SMS text with its links clickable (absolute, or app paths in the demo).
function LinkedText({ text }) {
  return String(text).split(LINK).map((part, i) => (i % 2 ? (
    <a key={i} href={part} className="break-all font-bold text-ocean-700 underline">{part}</a>
  ) : <span key={i}>{part}</span>))
}

export function SmsStatus({ status, error }) {
  const { t } = useT()
  if (!status || status === 'demo') return null
  const styles = { queued: 'text-muted-foreground', sent: 'text-ocean-700', failed: 'text-coral' }
  return (
    <div className={cn('mt-1 text-[11px] font-bold', styles[status])} title={error || ''}>
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
