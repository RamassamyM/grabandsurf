import { useState } from 'react'
import { AlertTriangle, Camera, Check, CheckCircle2, ChevronDown, Loader2, QrCode } from 'lucide-react'
import { api } from '@/api.js'
import { ErrorNote, IconBubble, Money, fileToBase64 } from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useT } from '@/i18n.jsx'
import { cn } from '@/lib/utils'
import { decodeImageFile, parseQr } from '@/qr.js'

const SHOTS = ['front', 'back', 'fins', 'board_qr', 'slot_qr', 'station_qr']
const QR_SHOTS = ['board_qr', 'slot_qr', 'station_qr']

export function photosPending(rental) {
  return rental.status === 'returned' && rental.receipt?.deposit_status === 'pending_check' && !rental.photo_taken
}

// Every receipt of the customer, newest first; open by default: the latest one and those still waiting for photos.
export function ReceiptList({ history, reload }) {
  const { t } = useT()
  const receipts = history.filter((r) => r.receipt)
  if (!receipts.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('receipts_empty')}</p>
  return (
    <div className="space-y-3">
      {receipts.map((r, i) => <ReceiptCard key={r.id} rental={r} reload={reload} defaultOpen={i === 0 || photosPending(r)} />)}
    </div>
  )
}

function ReceiptCard({ rental, reload, defaultOpen }) {
  const { t } = useT()
  const [open, setOpen] = useState(defaultOpen)
  const r = rental.receipt
  const pending = photosPending(rental)
  const deposit = pending ? t('deposit_waiting_photo') : ({
    pending_check: t('deposit_pending'), released: t('deposit_released'),
    charged: t('deposit_charged'), bought: t('deposit_bought'),
  }[r.deposit_status] || t('deposit_pending'))
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-soft', pending && 'border-coral/40')}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/50">
        <IconBubble icon={pending ? AlertTriangle : CheckCircle2} tone={pending ? 'coral' : 'foam'} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('receipt_number', { id: rental.id })}</div>
          <div className="font-extrabold"><span className="font-mono">{rental.board_id}</span> · {r.duration_label}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold"><Money cents={r.charged_cents} /></div>
          {pending && (
            <Badge variant="coral" className="text-[10px]">
              {t('photos_progress', { done: SHOTS.length - (rental.photos_missing || SHOTS).length, total: SHOTS.length })}
            </Badge>
          )}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t p-4">
          <dl className="divide-y rounded-xl border text-sm">
            <Row label={t('board')} value={<span className="font-mono">{rental.board_id}</span>} />
            <Row label={t('duration')} value={r.duration_label} />
            {r.pack_minutes > 0 && <Row label={t('pack_line')} value={`${r.pack_minutes} min`} />}
            {r.wallet_used_cents > 0 && <Row label={t('wallet_line')} value={<>- <Money cents={r.wallet_used_cents} /></>} />}
            <Row label={t('deposit')} value={<span className={cn(pending && 'text-coral')}>{deposit}</span>} />
            {rental.return_mode === 'manual' && <Row label={t('return_qr')} value={t('by_qr')} />}
            <Row label={t('paid')} value={<span className="text-lg font-extrabold"><Money cents={r.charged_cents} /></span>} />
          </dl>
          {rental.status === 'returned' && <ReturnPhotos rental={rental} reload={reload} />}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt><dd className="text-right font-bold">{value}</dd>
    </div>
  )
}

// What a QR shot must show, checked on the phone before sending (the server checks again).
function checkQr(shot, parsed, rental) {
  const station = (rental.end_station || '').toUpperCase()
  if (shot === 'board_qr') {
    if (parsed?.type === 'board' && parsed.id === (rental.board_id || '').toLowerCase()) return [parsed.id, null]
    return [null, parsed?.type === 'board' ? ['qr_other_board', { qr: parsed.id, board: rental.board_id }] : ['qr_not_found', {}]]
  }
  if (shot === 'station_qr') {
    if (parsed?.type === 'rack' && parsed.id === station) return [parsed.id, null]
    return [null, parsed ? ['qr_wrong_station', { station }] : ['qr_not_found', {}]]
  }
  if (parsed?.type === 'slot' && parsed.station === station) return [parsed.id, null]
  return [null, parsed ? ['qr_wrong_slot', { station }] : ['qr_not_found', {}]]
}

// The 6 return shots: front, back, fins, then the QR codes of the board, of the slot and of the station.
export function ReturnPhotos({ rental, reload }) {
  const { t } = useT()
  const [busy, setBusy] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState(null)
  const [justDone, setJustDone] = useState([])
  const missing = (rental.photos_missing || SHOTS).filter((s) => !justDone.includes(s))
  const done = SHOTS.length - missing.length
  if (!missing.length) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-foam p-3 text-sm font-bold text-ocean-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {message || t('photos_done')}
      </p>
    )
  }
  const take = async (shot, file) => {
    if (!file) return
    setBusy(shot); setErrors((e) => ({ ...e, [shot]: null }))
    try {
      let qr = null
      if (QR_SHOTS.includes(shot)) {
        const [value, problem] = checkQr(shot, parseQr(await decodeImageFile(file)), rental)
        if (problem) { setErrors((e) => ({ ...e, [shot]: t(problem[0], problem[1]) })); return }
        qr = value
      }
      const out = await api.uploadPhoto(rental.id, shot, qr, await fileToBase64(file))
      setJustDone((d) => [...d, shot])
      setMessage(out.message)
      if (reload) await reload()
    } catch (err) {
      setErrors((e) => ({ ...e, [shot]: err.message }))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="mt-4 space-y-3 rounded-2xl border-2 border-dashed border-sun/60 bg-sun/5 p-4">
      <div className="flex items-start gap-3">
        <IconBubble icon={Camera} tone="sun" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-extrabold">{t('photos_title')}</p>
            <span className="text-sm font-bold">{t('photos_progress', { done, total: SHOTS.length })}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('photos_text')}</p>
        </div>
      </div>
      <Progress value={(done / SHOTS.length) * 100} className="h-2 bg-white [&>div]:bg-sun" />
      <ol className="space-y-2">
        {SHOTS.map((shot) => {
          const ok = !missing.includes(shot)
          const inputId = `shot-${rental.id}-${shot}`
          return (
            <li key={shot}>
              <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { take(shot, e.target.files?.[0]); e.target.value = '' }} />
              <button type="button" disabled={ok || busy !== null} onClick={() => document.getElementById(inputId).click()}
                className={cn('flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left transition',
                  ok ? 'border-ocean/30 bg-foam/60' : 'hover:border-navy/40 active:scale-[.99]',
                  errors[shot] && 'border-coral/50')}>
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  ok ? 'bg-ocean text-white' : 'bg-navy text-sun')}>
                  {busy === shot ? <Loader2 className="h-4 w-4 animate-spin" /> : ok ? <Check className="h-4 w-4" />
                    : QR_SHOTS.includes(shot) ? <QrCode className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t(`shot_${shot}`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`shot_${shot}_hint`, { board: rental.board_id, station: rental.end_station || '' })}
                  </span>
                </span>
              </button>
              {errors[shot] && <ErrorNote error={errors[shot]} className="mt-1" />}
            </li>
          )
        })}
      </ol>
      {message && <p className="text-xs font-bold text-ocean-700">{message}</p>}
    </div>
  )
}
