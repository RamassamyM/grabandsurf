import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, session } from '../../api.js'
import QrScanner from '../../components/QrScanner.jsx'
import {
  Button, Card, ErrorNote, Logo, Money, SmsInbox, Spinner, fileToBase64, formatDuration, usePoll,
} from '../../components/ui.jsx'
import { LangSwitch, useT } from '../../i18n.jsx'
import { decodeImageFile, parseQr } from '../../qr.js'

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

  const onLogged = (tok, p) => { session.save(tok, p); setToken(tok); setPhone(p) }
  const logout = () => { session.clear(); setToken(null); setPhone(null) }
  const info = stationInfo.data

  return (
    <div className="min-h-dvh pb-28">
      <header className="cork-texture px-4 pb-8 pt-6 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <Link to="/" className="rounded-lg bg-white/90 px-2 py-1"><Logo small /></Link>
          <LangSwitch />
        </div>
        <div className="mx-auto mt-6 max-w-md">
          <div className="flex items-center justify-between">
            <div className="text-sm uppercase tracking-widest text-white/80">{t('rack', { id: station })}</div>
            {token && <button onClick={logout} className="text-sm font-medium text-white/90 underline">{t('change_number')}</button>}
          </div>
          <h1 className="font-display text-3xl font-bold">{info ? info.name : 'Station'}</h1>
          {info && (
            <p className="mt-1 text-white/90">
              {info.available_boards.length > 0 ? t('available', { n: info.available_boards.length }) : t('none_available')}
              {info.online === false && ` · ${t('station_offline')}`}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-4">
        {stationInfo.error && <ErrorNote error={stationInfo.error.message} />}
        {!token && <SignUp onLogged={onLogged} referral={params.get('ref') || ''} />}
        {token && !me.data && !me.error && <Spinner label={t('loading')} />}
        {token && me.data && me.data.card_hold_status !== 'authorized' && <CardStep onDone={me.reload} />}
        {token && me.data && me.data.card_hold_status === 'authorized' && (
          <Rental station={station} me={me.data} reload={me.reload} available={info?.available_boards || []} />
        )}
        {token && me.data && <WalletCard me={me.data} station={station} />}
        {info && <p className="px-2 text-center text-xs text-ocean-700/70">{t('help_footer', { phone: info.operator_phone })}</p>}
      </main>
      <SmsInbox phone={phone} />
    </div>
  )
}

function SignUp({ onLogged, referral }) {
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
    try { setSent(await api.sendOtp(phone)) } catch (err) { setError(err.message) }
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

  if (!sent) {
    return (
      <Card>
        <h2 className="font-display text-xl font-semibold">{t('signup_title')}</h2>
        <p className="mt-1 text-sm text-ocean-700">{t('signup_text')}</p>
        <form onSubmit={send} className="mt-4 space-y-3">
          <label className="label" htmlFor="phone">{t('phone_label')}</label>
          <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" required
            placeholder={t('phone_placeholder')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <ErrorNote error={error} />
          <Button className="w-full" busy={busy}>{t('send_code')}</Button>
        </form>
      </Card>
    )
  }
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">{t('code_title')}</h2>
      <p className="mt-1 text-sm text-ocean-700">{t('code_sent_to', { phone: sent.phone })}</p>
      {sent.demo_code && (
        <p className="mt-3 rounded-xl bg-sand-100 px-4 py-3 text-sm">
          {t('demo_code')} <strong className="font-mono text-lg tracking-widest">{sent.demo_code}</strong>
        </p>
      )}
      <form onSubmit={verify} className="mt-4 space-y-3">
        <label className="label" htmlFor="code">{t('code_label')}</label>
        <input id="code" className="input text-center font-mono text-2xl tracking-[.5em]" inputMode="numeric"
          maxLength={4} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <label className="label" htmlFor="ref">{t('referral_label')}</label>
        <input id="ref" className="input uppercase" placeholder="SURF-7K2P" value={ref}
          onChange={(e) => setRef(e.target.value)} />
        <ErrorNote error={error} />
        <Button className="w-full" busy={busy}>{t('validate')}</Button>
        <button type="button" className="w-full text-sm text-ocean-700 underline" onClick={() => setSent(null)}>
          {t('change_number')}
        </button>
      </form>
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
      <h2 className="font-display text-xl font-semibold">{t('card_title')}</h2>
      <p className="mt-1 text-sm text-ocean-700">{t('card_text')}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="label" htmlFor="card">{t('card_label')}</label>
        <input id="card" className="input font-mono" inputMode="numeric" value={number}
          onChange={(e) => setNumber(e.target.value)} />
        <ErrorNote error={error} />
        <Button className="w-full" busy={busy}>{t('card_save')}</Button>
      </form>
    </Card>
  )
}

function Rental({ station, me, reload, available }) {
  const current = me.current_rental
  const last = !current && me.history.length ? me.history[0] : null
  if (current && current.status === 'armed') return <Armed rental={current} reload={reload} />
  if (current) return <Live rental={current} station={station} reload={reload} />
  return (
    <>
      {last && last.receipt && <Receipt rental={last} reload={reload} />}
      <RentForm station={station} reload={reload} available={available} />
    </>
  )
}

function RentForm({ station, reload, available }) {
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
    <Card>
      <h2 className="font-display text-xl font-semibold">{t('ready_title')}</h2>
      <p className="mt-1 text-sm text-ocean-700">{t('ready_text')}</p>
      {showPack ? (
        <div className="mt-4">
          <label className="label" htmlFor="pack">{t('pack_label')}</label>
          <input id="pack" className="input uppercase" placeholder="MAIF-SURF" value={pack} onChange={(e) => setPack(e.target.value)} />
        </div>
      ) : (
        <button className="mt-3 text-sm font-medium text-ocean-500 underline" onClick={() => setShowPack(true)}>
          {t('have_pack')}
        </button>
      )}
      <div className="mt-4"><ErrorNote error={error} /></div>
      <Button className="mt-3 w-full text-lg" busy={busy} disabled={!available.length} onClick={rent}>
        {available.length ? t('rent') : t('no_board_here')}
      </Button>
    </Card>
  )
}

function Armed({ rental, reload }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const cancel = async () => { setBusy(true); try { await api.cancelRental(rental.id) } finally { await reload(); setBusy(false) } }
  return (
    <Card tone="ocean" className="text-center">
      <div className="text-sm uppercase tracking-widest text-white/80">{t('yours')}</div>
      <div className="mt-2 font-display text-4xl font-bold">{t('take_board', { board: rental.board_id })}</div>
      <p className="mt-3 text-white/90">{t('take_text')}</p>
      {rental.pack_code && <p className="mt-2 text-sm text-white/80">{t('pack_applied', { code: rental.pack_code })}</p>}
      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/80">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {t('waiting_departure')}
      </div>
      <Button variant="light" className="mt-4 w-full" busy={busy} onClick={cancel}>{t('cancel')}</Button>
    </Card>
  )
}

function Live({ rental, station, reload }) {
  const { t } = useT()
  const live = rental.live || {}
  const [manual, setManual] = useState(false)
  const overdue = rental.status === 'not_returned'
  return (
    <>
      <Card tone={overdue ? 'coral' : 'ocean'}>
        <div className="flex items-center justify-between text-sm text-white/80">
          <span>{overdue ? t('not_returned') : t('session_running')}</span>
          <span className="font-mono">{rental.board_id}</span>
        </div>
        <div className="mt-2 font-display text-5xl font-bold tabular-nums">{formatDuration(rental.duration_s)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-white/70">{t('current_price')}</div>
            <div className="text-xl font-semibold"><Money cents={live.charged_cents} /></div>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-white/70">{live.pack_minutes ? t('pack_covered') : t('wallet_used')}</div>
            <div className="text-xl font-semibold">
              {live.pack_minutes ? `${live.pack_minutes} min` : <Money cents={live.wallet_used_cents} />}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/90">{overdue ? t('overdue_text') : t('hang_back')}</p>
      </Card>
      {manual ? (
        <ManualReturn rental={rental} station={station} reload={reload} />
      ) : (
        <button className="w-full text-center text-sm text-ocean-700 underline" onClick={() => setManual(true)}>
          {t('no_sms')}
        </button>
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
      <h3 className="font-semibold">{t('backup_title')}</h3>
      <p className="mt-1 text-sm text-ocean-700">{t('backup_text', { rack })}</p>
      <Button className="mt-3 w-full" onClick={() => setScanning(true)}>{t('scan')}</Button>
      <form onSubmit={(e) => { e.preventDefault(); submit(qr) }} className="mt-3 flex gap-2">
        <input className="input font-mono" placeholder={rental.board_id} value={qr} onChange={(e) => setQr(e.target.value)}
          aria-label={t('qr_manual')} />
        <Button variant="ghost" busy={busy}>{t('return_board')}</Button>
      </form>
      <div className="mt-2"><ErrorNote error={error} /></div>
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
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">{t('receipt_title')}</h2>
        <span className="rounded-full bg-ocean-100 px-2 py-1 text-xs font-semibold text-ocean-700">{t('receipt')}</span>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        <Row label={t('board')} value={rental.board_id} />
        <Row label={t('duration')} value={r.duration_label} />
        {r.pack_minutes > 0 && <Row label={t('pack_line')} value={`${r.pack_minutes} min`} />}
        {r.wallet_used_cents > 0 && <Row label={t('wallet_line')} value={<>- <Money cents={r.wallet_used_cents} /></>} />}
        <Row label={t('paid')} value={<strong><Money cents={r.charged_cents} /></strong>} />
        <Row label={t('deposit')} value={deposit} />
        {rental.return_mode === 'manual' && <Row label={t('return_qr')} value={t('by_qr')} />}
      </dl>
      <PhotoReturn rental={rental} reload={reload} />
    </Card>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 border-b border-sand-200 py-1 last:border-0">
      <dt className="text-ocean-700">{label}</dt><dd className="text-right">{value}</dd>
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
    return <p className="mt-4 rounded-xl bg-ocean-50 p-3 text-sm font-semibold text-ocean-700">{t('photo_done')}</p>
  }
  if (result) {
    return (
      <div className="mt-4 rounded-xl bg-ocean-50 p-3 text-sm">
        <p className="font-semibold text-ocean-700">{result.message}</p>
        <p className="mt-1 text-ocean-700/80">
          {t('diagnosis')} : {result.damage_detected ? t('damage_found') : t('no_damage')}
          {' · '}{t('footprint')} {result.sha256.slice(0, 10)}…
        </p>
      </div>
    )
  }
  return (
    <div className="mt-4 rounded-xl border border-dashed border-cork-400 bg-sand-50 p-3">
      <p className="text-sm font-semibold">{t('photo_title')}</p>
      <p className="text-xs text-ocean-700/80">{t('photo_text')}</p>
      <input id={`photo-${rental.id}`} type="file" accept="image/*" capture="environment" className="hidden" onChange={choose} />
      <Button variant="ghost" className="mt-3 w-full" onClick={() => document.getElementById(`photo-${rental.id}`).click()}>
        {file ? t('retake_photo') : t('take_photo')}
      </Button>
      {preview && <img src={preview} alt="" className="mt-3 max-h-48 w-full rounded-xl object-cover" />}
      {qr && <p className="mt-2 text-sm font-medium text-ocean-700">✓ {t('qr_found', { board: qr })}</p>}
      {qr === '' && (
        <div className="mt-2">
          <p className="text-sm text-coral-600">{t('qr_not_found')}</p>
          <input className="input mt-2 font-mono" placeholder={rental.board_id} value={manualQr}
            onChange={(e) => setManualQr(e.target.value)} aria-label={t('qr_manual')} />
        </div>
      )}
      <div className="mt-2"><ErrorNote error={error} /></div>
      <Button variant="cork" className="mt-2 w-full" busy={busy} disabled={!file} onClick={send}>{t('send_photo')}</Button>
    </div>
  )
}

function WalletCard({ me, station }) {
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
    <Card tone="sand">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-ocean-700">{t('wallet')}</div>
          <div className="font-display text-3xl font-bold"><Money cents={me.wallet_cents} /></div>
        </div>
        <div className="text-right text-xs text-ocean-700/80">{t('wallet_next')}</div>
      </div>
      <div className="mt-4 rounded-xl bg-white p-3">
        <div className="text-sm text-ocean-700">{t('my_referral')}</div>
        <div className="font-mono text-2xl font-bold tracking-wider text-cork-600">{me.referral_code}</div>
        <p className="mt-1 text-xs text-ocean-700/80">{t('referral_text')}</p>
        <Button variant="ghost" className="mt-3 w-full" onClick={share}>{copied ? t('link_copied') : t('share_code')}</Button>
      </div>
    </Card>
  )
}
