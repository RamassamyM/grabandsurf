import { useState } from 'react'
import { Camera, CheckCircle2, ChevronDown, Loader2, QrCode } from 'lucide-react'
import { api, session } from '@/api.js'
import { ErrorNote, IconBubble, Money, fileToBase64 } from '@/components/common.jsx'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { useT } from '@/i18n.jsx'
import { cn } from '@/lib/utils'
import { decodeImageFile, parseQr } from '@/qr.js'

const SHOTS = ['front', 'back', 'fins', 'board_qr', 'slot_qr', 'station_qr']
const QR_SHOTS = ['board_qr', 'slot_qr', 'station_qr']

// The optional return photos are offered for a returned rental, unless declined on this phone.
export function photosOffered(rental) {
  return Boolean(rental) && rental.status === 'returned' && !session.photosDeclined(rental.id)
}

// Every receipt of the customer, newest first; the latest one open.
export function ReceiptList({ history }) {
  const { t } = useT()
  const receipts = history.filter((r) => r.receipt)
  if (!receipts.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('receipts_empty')}</p>
  return (
    <div className="space-y-3">
      {receipts.map((r, i) => <ReceiptCard key={r.id} rental={r} defaultOpen={i === 0} />)}
    </div>
  )
}

function ReceiptCard({ rental, defaultOpen }) {
  const { t } = useT()
  const [open, setOpen] = useState(defaultOpen)
  const r = rental.receipt
  const deposit = {
    pending_check: t('deposit_pending'), released: t('deposit_released'),
    charged: t('deposit_charged'), bought: t('deposit_bought'),
  }[r.deposit_status] || t('deposit_pending')
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/50">
        <IconBubble icon={CheckCircle2} tone="foam" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('receipt_number', { id: rental.id })}</div>
          <div className="font-extrabold"><span className="font-mono">{rental.board_id}</span> · {r.duration_label}</div>
        </div>
        <div className="text-lg font-extrabold"><Money cents={r.charged_cents} /></div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t p-4">
          <dl className="divide-y rounded-xl border text-sm">
            <Row label={t('board')} value={<span className="font-mono">{rental.board_id}</span>} />
            <Row label={t('duration')} value={r.duration_label} />
            {r.pack_minutes > 0 && <Row label={t('pack_line')} value={`${r.pack_minutes} min`} />}
            {r.wallet_used_cents > 0 && <Row label={t('wallet_line')} value={<>- <Money cents={r.wallet_used_cents} /></>} />}
            <Row label={t('deposit')} value={deposit} />
            {rental.return_mode === 'manual' && <Row label={t('return_qr')} value={t('by_qr')} />}
            <Row label={t('paid')} value={<span className="text-lg font-extrabold"><Money cents={r.charged_cents} /></span>} />
          </dl>
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

function rewardLabel(cents, lang) {
  return new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 })
    .format(cents / 100)
}

// The return photo reward: "+1 €".
export function RewardTag({ cents, className = '' }) {
  const { lang } = useT()
  return (
    <span className={cn('shrink-0 rounded-full bg-sun px-2.5 py-0.5 text-sm font-extrabold tabular-nums text-navy', className)}>
      +{rewardLabel(cents, lang)}
    </span>
  )
}

// A small optional offer: take the photos (+1 €) or say no thanks.
export function PhotoOffer({ rental, rewardCents, reload }) {
  const { t, lang } = useT()
  const [open, setOpen] = useState(false)
  const [declined, setDeclined] = useState(false)
  const done = SHOTS.length - (rental.photos_missing || SHOTS).length
  const decline = () => { session.declinePhotos(rental.id); setDeclined(true) }
  const close = (value) => { setOpen(value); if (!value && reload) reload() }
  // stays mounted while the flow is open, so its last screen shows even once the photos are all in
  if (declined || (rental.photo_taken && !open)) return null
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft">
      <p className="font-extrabold">{t('photo_offer_title', { amount: rewardLabel(rewardCents || 0, lang) })}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{t('photo_offer_text')}</p>
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={() => setOpen(true)}>
          <Camera /> {done ? t('photo_offer_continue', { done, total: SHOTS.length }) : t('photo_offer_start')}
        </Button>
        <Button variant="ghost" onClick={decline}>{t('photo_offer_decline')}</Button>
      </div>
      <Dialog open={open} onOpenChange={close}>
        {open && <PhotoFlow rental={rental} onClose={() => close(false)} />}
      </Dialog>
    </div>
  )
}

// One photo per screen, in order: front, back, fins, then the QR codes of the board, of the slot and of the station.
function PhotoFlow({ rental, onClose }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [justDone, setJustDone] = useState([])
  const [earned, setEarned] = useState(0)
  const missing = (rental.photos_missing || SHOTS).filter((s) => !justDone.includes(s))
  const shot = missing[0]
  const step = SHOTS.length - missing.length + 1
  const take = async (file) => {
    if (!file || !shot) return
    setBusy(true); setError(null)
    try {
      let qr = null
      if (QR_SHOTS.includes(shot)) {
        const [value, problem] = checkQr(shot, parseQr(await decodeImageFile(file)), rental)
        if (problem) { setError(t(problem[0], problem[1])); return }
        qr = value
      }
      const out = await api.uploadPhoto(rental.id, shot, qr, await fileToBase64(file))
      if (out.credited_cents) setEarned(out.credited_cents)
      setJustDone((d) => [...d, shot])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <DialogContent className="flex h-dvh w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-w-md sm:rounded-2xl">
      {shot ? (
        <>
          <div className="space-y-2 p-5 pb-0">
            <p className="text-sm font-bold text-muted-foreground">{t('photo_step', { n: step, total: SHOTS.length })}</p>
            <Progress value={((step - 1) / SHOTS.length) * 100} className="h-1.5 [&>div]:bg-sun" />
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-foam text-navy">
              {QR_SHOTS.includes(shot) ? <QrCode className="h-9 w-9" /> : <Camera className="h-9 w-9" />}
            </span>
            <DialogTitle className="text-2xl font-extrabold">{t(`shot_${shot}`)}</DialogTitle>
            <DialogDescription className="text-base">
              {t(`shot_${shot}_hint`, { board: rental.board_id, station: rental.end_station || '' })}
            </DialogDescription>
            {error && <ErrorNote error={error} />}
          </div>
          <div className="p-5">
            <input id="return-shot" type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
            <Button size="lg" className="h-14 w-full text-base" disabled={busy}
              onClick={() => document.getElementById('return-shot').click()}>
              {busy ? <Loader2 className="animate-spin" /> : <Camera />} {t('take_photo')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <CheckCircle2 className="h-14 w-14 text-ocean" />
          <DialogTitle className="text-2xl font-extrabold">{t('photos_done')}</DialogTitle>
          <DialogDescription className="text-base">{earned ? t('reward_earned_text') : ''}</DialogDescription>
          {earned > 0 && <RewardTag cents={earned} className="text-lg" />}
          <Button size="lg" className="mt-4 w-full" onClick={onClose}>{t('photos_finish')}</Button>
        </div>
      )}
    </DialogContent>
  )
}
