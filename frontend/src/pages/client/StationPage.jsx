import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Camera, Check, CheckCircle2, CreditCard, Gift, Loader2, MessageSquareText, Phone, QrCode, Share2, Tag, Timer, Waves as WavesIcon,
} from 'lucide-react'
import { api, session } from '@/api.js'
import QrScanner from '@/components/QrScanner.jsx'
import { CustomerHeader } from '@/components/Layout.jsx'
import {
  ErrorNote, IconBubble, Money, Script, SmsInbox, Spinner, fileToBase64, formatDuration, usePoll,
} from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n.jsx'
import { cn } from '@/lib/utils'
import { decodeImageFile, parseQr } from '@/qr.js'

// Customer journey at a rack: sign up once, then rent in 2 gestures.
export default function StationPage() {
  const { t } = useT()
  const { station: raw } = useParams()
  const station = (raw || 'A').toUpperCase()
  const [params] = useSearchParams()
  const [token, setToken] = useState(session.token())
  const [phone, setPhone] = useState(session.phone())
  const stationInfo = usePoll(() => api.station(station), 5000, [station])
  const me = usePoll(() => (token ? api.me() : Promise.resolve(null)), 2000, [token])

  useEffect(() => { session.rememberRack(station) }, [station])
  useEffect(() => {
    if (me.error && me.error.status === 401) { session.clear(); setToken(null) }
  }, [me.error])

  const onCodeSent = (p) => { session.setPhone(p); setPhone(p) }
  const onLogged = (tok, p) => { session.save(tok, p); setToken(tok); setPhone(p) }
  const logout = () => { session.clear(); setToken(null); setPhone(null) }
  const info = stationInfo.data
  const user = token ? me.data : null
  const cardOk = Boolean(user && user.card_hold_status === 'authorized')
  const step = !user ? 0 : cardOk ? 2 : 1
  const available = info?.available_boards || []

  return (
    <div className="min-h-dvh pb-28">
      <CustomerHeader walletCents={user ? user.wallet_cents : null}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-lagoon">{t('rack', { id: station })}</span>
          {token && <button onClick={logout} className="text-xs font-bold text-white/60 hover:text-white">{t('change_number')}</button>}
        </div>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight">{info ? info.name : 'Station'}</h1>
        {!token && <p className="mt-1 text-2xl leading-snug"><Script>{t('tagline')}</Script></p>}
        {info && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 font-bold">
              <span className={cn('h-2 w-2 rounded-full', available.length ? 'bg-lagoon' : 'bg-coral')} />
              {available.length ? t('available', { n: available.length }) : t('none_available')}
            </span>
            {info.online === false && <span className="text-xs text-white/60">{t('station_offline')}</span>}
          </div>
        )}
      </CustomerHeader>

      <main className="mx-auto max-w-md space-y-4 px-4">
        {step < 2 && <Stepper step={step} />}
        {stationInfo.error && <ErrorNote error={stationInfo.error.message} />}
        {!token && <SignUp onCodeSent={onCodeSent} onLogged={onLogged} referral={params.get('ref') || ''} />}
        {token && !me.data && !me.error && <Spinner label={t('loading')} />}
        {user && !cardOk && <CardStep onDone={me.reload} />}
        {cardOk && <Rental station={station} me={user} reload={me.reload} available={available} />}
        {info && <p className="px-4 pt-2 text-center text-xs text-muted-foreground">{t('help_footer', { phone: info.operator_phone })}</p>}
      </main>
      <SmsInbox phone={phone} />
    </div>
  )
}

function Stepper({ step }) {
  const { t } = useT()
  const steps = [t('step_phone'), t('step_card'), t('step_surf')]
  return (
    <ol className="flex items-center gap-2 px-1">
      {steps.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold',
            i < step ? 'bg-ocean text-white' : i === step ? 'bg-navy text-sun' : 'bg-muted text-muted-foreground')}>
            {i < step ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={cn('text-sm font-bold', i === step ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
          {i < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  )
}

function SignUp({ onCodeSent, onLogged, referral }) {
  const { t } = useT()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [ref, setRef] = useState(referral)
  const [sent, setSent] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const send = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await api.sendOtp(phone)
      setSent(r)
      onCodeSent(r.phone)  // the demo text shows right now, on the code step
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const verify = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await api.verifyOtp(sent.phone, code, ref)
      if (r.pack_code) session.setPendingPack(r.pack_code)
      onLogged(r.token, sent.phone)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  const restart = () => { setSent(null); setCode(''); onCodeSent(null) }

  if (!sent) {
    return (
      <Card>
        <CardHeader>
          <IconBubble icon={Phone} />
          <CardTitle className="pt-2 text-xl">{t('signup_title')}</CardTitle>
          <CardDescription>{t('signup_text')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={send} className="space-y-3">
            <Label htmlFor="phone">{t('phone_label')}</Label>
            <Input id="phone" className="h-12 text-lg" type="tel" inputMode="tel" autoComplete="tel" required
              placeholder={t('phone_placeholder')} value={phone} onChange={(e) => setPhone(e.target.value)} />
            <ErrorNote error={error} />
            <Button size="lg" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} {t('send_code')}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <IconBubble icon={MessageSquareText} />
        <CardTitle className="pt-2 text-xl">{t('code_title')}</CardTitle>
        <CardDescription>{t('code_sent_to', { phone: sent.phone })}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent.demo_code && (
          <div className="mb-4 flex items-center justify-between rounded-xl bg-foam px-4 py-3 text-sm">
            <span className="text-muted-foreground">{t('demo_code')}</span>
            <strong className="font-mono text-xl tracking-[.3em]">{sent.demo_code}</strong>
          </div>
        )}
        <form onSubmit={verify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">{t('code_label')}</Label>
            <Input id="code" className="h-14 text-center font-mono text-3xl tracking-[.6em]" inputMode="numeric" autoComplete="one-time-code"
              maxLength={4} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref" className="text-muted-foreground">{t('referral_label')}</Label>
            <Input id="ref" className="uppercase" placeholder="SURF-7K2P" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" disabled={busy || code.length < 4}>
            {busy && <Loader2 className="animate-spin" />} {t('validate')}
          </Button>
          <Button type="button" variant="link" className="w-full text-muted-foreground" onClick={restart}>
            {t('change_number')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function CardStep({ onDone }) {
  const { t } = useT()
  const [number, setNumber] = useState('4242 4242 4242 4242')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await api.addCard(number); await onDone() } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <Card>
      <CardHeader>
        <IconBubble icon={CreditCard} />
        <CardTitle className="pt-2 text-xl">{t('card_title')}</CardTitle>
        <CardDescription>{t('card_text')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Label htmlFor="card">{t('card_label')}</Label>
          <Input id="card" className="h-12 font-mono text-lg" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} {t('card_save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Rental({ station, me, reload, available }) {
  const current = me.current_rental
  const last = !current && me.history.length ? me.history[0] : null
  if (current && current.status === 'armed') return <Armed rental={current} reload={reload} />
  if (current) return <Live rental={current} station={station} reload={reload} />
  // End of the journey: receipt and return photo, then the referral, then the next rental.
  const finished = Boolean(last && last.receipt)
  return (
    <>
      {finished && <Receipt rental={last} reload={reload} />}
      {finished && <ReferralCard me={me} station={station} />}
      <RentForm station={station} reload={reload} available={available} again={finished} />
    </>
  )
}

function RentForm({ station, reload, available, again }) {
  const { t } = useT()
  const [pack, setPack] = useState(session.pendingPack())
  const [showPack, setShowPack] = useState(Boolean(session.pendingPack()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const rent = async () => {
    setBusy(true); setError(null)
    try { await api.rent(station, pack); session.setPendingPack(null); await reload() } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <Card className={cn(!again && 'border-navy/30')}>
      <CardHeader>
        <CardTitle className="text-2xl">{t('ready_title')}</CardTitle>
        <CardDescription>{t('ready_text')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {showPack ? (
          <div className="space-y-2">
            <Label htmlFor="pack">{t('pack_label')}</Label>
            <Input id="pack" className="uppercase" placeholder="MAIF-SURF" value={pack} onChange={(e) => setPack(e.target.value)} />
          </div>
        ) : (
          <button className="flex items-center gap-2 text-sm font-bold text-ocean-700 hover:underline" onClick={() => setShowPack(true)}>
            <Tag className="h-4 w-4" /> {t('have_pack')}
          </button>
        )}
        <ErrorNote error={error} />
        <Button variant="sun" size="xl" className="w-full" disabled={busy || !available.length} onClick={rent}>
          {busy ? <Loader2 className="animate-spin" /> : <WavesIcon className="!h-5 !w-5" />}
          {available.length ? t('rent') : t('no_board_here')}
        </Button>
      </CardContent>
    </Card>
  )
}

function Armed({ rental, reload }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const cancel = async () => { setBusy(true); try { await api.cancelRental(rental.id) } finally { await reload(); setBusy(false) } }
  return (
    <div className="rounded-3xl bg-navy p-6 text-center text-white shadow-soft">
      <div className="text-xs font-bold uppercase tracking-widest text-lagoon">{t('yours')}</div>
      <div className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">
        {t('take_board', { board: '' }).trim()} <span className="font-script font-normal text-sun">{rental.board_id}</span>
      </div>
      <p className="mx-auto mt-4 max-w-xs text-white/80">{t('take_text')}</p>
      {rental.pack_code && <Badge variant="sun" className="mt-3">{t('pack_applied', { code: rental.pack_code })}</Badge>}
      <div className="mt-5 flex items-center justify-center gap-2 text-sm text-white/70">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lagoon opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lagoon" />
        </span>
        {t('waiting_departure')}
      </div>
      <Button variant="glass" size="lg" className="mt-5 w-full" disabled={busy} onClick={cancel}>{t('cancel')}</Button>
    </div>
  )
}

function Live({ rental, station, reload }) {
  const { t } = useT()
  const live = rental.live || {}
  const [manual, setManual] = useState(false)
  const overdue = rental.status === 'not_returned'
  return (
    <>
      <div className={cn('rounded-3xl p-6 text-white shadow-soft', overdue ? 'bg-coral' : 'bg-navy')}>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 font-bold">
            <Timer className="h-4 w-4" /> {overdue ? t('not_returned') : t('session_running')}
          </span>
          <Badge variant="outline" className="border-white/20 font-mono text-white">{rental.board_id}</Badge>
        </div>
        <div className="mt-4 text-5xl font-extrabold tabular-nums tracking-tight">{formatDuration(rental.duration_s)}</div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 p-3">
            <div className="text-white/60">{t('current_price')}</div>
            <div className="text-xl font-extrabold"><Money cents={live.charged_cents} /></div>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <div className="text-white/60">{live.pack_minutes ? t('pack_covered') : t('wallet_used')}</div>
            <div className="text-xl font-extrabold text-sun">
              {live.pack_minutes ? `${live.pack_minutes} min` : <Money cents={live.wallet_used_cents} />}
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-white/80">{overdue ? t('overdue_text') : t('hang_back')}</p>
      </div>
      {manual ? (
        <ManualReturn rental={rental} station={station} reload={reload} />
      ) : (
        <Button variant="link" className="h-auto w-full whitespace-normal text-muted-foreground" onClick={() => setManual(true)}>{t('no_sms')}</Button>
      )}
    </>
  )
}

function ManualReturn({ rental, station, reload }) {
  const { t } = useT()
  const [qr, setQr] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const rack = session.recentRack() || station
  const submit = async (boardQr) => {
    setBusy(true); setError(null)
    try { await api.manualReturn(rental.id, rack, boardQr); await reload() } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('backup_title')}</CardTitle>
        <CardDescription>{t('backup_text', { rack })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="lg" className="w-full" onClick={() => setScanning(true)}><QrCode /> {t('scan')}</Button>
        <form onSubmit={(e) => { e.preventDefault(); submit(qr) }} className="flex gap-2">
          <Input className="font-mono" placeholder={rental.board_id} value={qr} onChange={(e) => setQr(e.target.value)} aria-label={t('qr_manual')} />
          <Button variant="outline" className="h-11" disabled={busy}>{t('return_board')}</Button>
        </form>
        <ErrorNote error={error} />
      </CardContent>
      {scanning && (
        <QrScanner expect="board" onClose={() => setScanning(false)}
          onResult={(r) => { setScanning(false); setQr(r.id); submit(r.id) }} />
      )}
    </Card>
  )
}

function Receipt({ rental, reload }) {
  const { t } = useT()
  const r = rental.receipt
  const deposit = {
    pending_check: t('deposit_pending'), released: t('deposit_released'),
    charged: t('deposit_charged'), bought: t('deposit_bought'),
  }[r.deposit_status] || t('deposit_pending')
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <IconBubble icon={CheckCircle2} tone="ocean" />
        <div>
          <CardTitle className="text-xl">{t('receipt_title')}</CardTitle>
          <CardDescription>{t('receipt')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="divide-y rounded-xl border text-sm">
          <Row label={t('board')} value={<span className="font-mono">{rental.board_id}</span>} />
          <Row label={t('duration')} value={r.duration_label} />
          {r.pack_minutes > 0 && <Row label={t('pack_line')} value={`${r.pack_minutes} min`} />}
          {r.wallet_used_cents > 0 && <Row label={t('wallet_line')} value={<>- <Money cents={r.wallet_used_cents} /></>} />}
          <Row label={t('deposit')} value={deposit} />
          {rental.return_mode === 'manual' && <Row label={t('return_qr')} value={t('by_qr')} />}
          <Row label={t('paid')} value={<span className="text-lg font-extrabold"><Money cents={r.charged_cents} /></span>} />
        </dl>
        <PhotoReturn rental={rental} reload={reload} />
      </CardContent>
    </Card>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt><dd className="text-right font-bold">{value}</dd>
    </div>
  )
}

// Return photo: the QR code is read on the phone from the photo itself, then the backend diagnoses it.
export function PhotoReturn({ rental, reload }) {
  const { t } = useT()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [qr, setQr] = useState(null)       // null: not read yet, '': not readable
  const [manualQr, setManualQr] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const inputId = `photo-${rental.id}`

  const choose = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f); setResult(null); setError(null)
    setPreview(URL.createObjectURL(f))
    const text = await decodeImageFile(f)
    const parsed = parseQr(text)
    setQr(parsed && parsed.type === 'board' ? parsed.id : '')
  }
  const send = async () => {
    setBusy(true); setError(null)
    try {
      const img = file ? await fileToBase64(file) : ''
      const r = await api.uploadPhoto(rental.id, qr || manualQr.trim().toLowerCase(), img)
      setResult(r)
      if (reload) await reload()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  if (!result && rental.photo_credited) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-foam p-3 text-sm font-bold text-ocean-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {t('photo_done')}
      </p>
    )
  }
  if (result) {
    return (
      <div className="mt-4 rounded-xl bg-foam p-3 text-sm">
        <p className="font-bold text-ocean-700">{result.message}</p>
        <p className="mt-1 text-muted-foreground">
          {t('diagnosis')} : {result.damage_detected ? t('damage_found') : t('no_damage')}
          {' · '}{t('footprint')} <span className="font-mono">{result.sha256.slice(0, 10)}…</span>
        </p>
      </div>
    )
  }
  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-sun/60 bg-sun/5 p-4">
      <div className="flex items-start gap-3">
        <IconBubble icon={Camera} tone="sun" />
        <div>
          <p className="font-bold leading-snug">{t('photo_title')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('photo_text')}</p>
        </div>
      </div>
      <input id={inputId} type="file" accept="image/*" capture="environment" className="hidden" onChange={choose} />
      {preview && <img src={preview} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />}
      {qr && <p className="mt-2 flex items-center gap-1 text-sm font-bold text-ocean-700"><Check className="h-4 w-4" /> {t('qr_found', { board: qr })}</p>}
      {qr === '' && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-coral">{t('qr_not_found')}</p>
          <Input className="font-mono" placeholder={rental.board_id} value={manualQr}
            onChange={(e) => setManualQr(e.target.value)} aria-label={t('qr_manual')} />
        </div>
      )}
      <ErrorNote error={error} className="mt-2" />
      <div className="mt-3 grid gap-2">
        <Button variant="outline" onClick={() => document.getElementById(inputId).click()}>
          <Camera /> {file ? t('retake_photo') : t('take_photo')}
        </Button>
        {file && (
          <Button variant="sun" disabled={busy} onClick={send}>
            {busy && <Loader2 className="animate-spin" />} {t('send_photo')}
          </Button>
        )}
      </div>
    </div>
  )
}

function ReferralCard({ me, station }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/s/${station}?ref=${me.referral_code}`
  const share = async () => {
    const text = t('share_text', { code: me.referral_code })
    try {
      if (navigator.share) await navigator.share({ title: 'Grab&Surf', text, url: link })
      else { await navigator.clipboard.writeText(`${text} ${link}`); setCopied(true) }
    } catch { /* share sheet closed */ }
  }
  return (
    <div className="rounded-3xl bg-sun p-5 text-navy shadow-soft">
      <div className="flex items-center gap-3">
        <IconBubble icon={Gift} tone="navy" />
        <div className="text-xl font-extrabold leading-tight">{t('referral_end_title')}</div>
      </div>
      <p className="mt-3 text-sm text-navy/80">{t('referral_text')}</p>
      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-navy/60">{t('my_referral')}</div>
        <div className="font-mono text-2xl font-extrabold tracking-wider">{me.referral_code}</div>
        <Button onClick={share} className="mt-3 w-full">
          {copied ? <Check /> : <Share2 />} {copied ? t('link_copied') : t('share_code')}
        </Button>
      </div>
    </div>
  )
}
