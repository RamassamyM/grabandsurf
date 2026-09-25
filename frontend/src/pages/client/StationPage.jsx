import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, session } from '../../api.js'
import {
  Button, Card, ErrorNote, Logo, Money, SmsInbox, Spinner, fileToBase64, formatDuration, usePoll,
} from '../../components/ui.jsx'

// Customer journey at a rack: sign up once, then rent in 2 gestures.
export default function StationPage() {
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

  const onLogged = (t, p) => { session.save(t, p); setToken(t); setPhone(p) }
  const logout = () => { session.clear(); setToken(null); setPhone(null) }

  return (
    <div className="min-h-dvh pb-28">
      <header className="cork-texture px-4 pb-8 pt-6 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <Link to="/" className="rounded-lg bg-white/90 px-2 py-1"><Logo small /></Link>
          {token && <button onClick={logout} className="text-sm font-medium text-white/90 underline">Changer de numéro</button>}
        </div>
        <div className="mx-auto mt-6 max-w-md">
          <div className="text-sm uppercase tracking-widest text-white/80">Rack {station}</div>
          <h1 className="font-display text-3xl font-bold">
            {stationInfo.data ? stationInfo.data.name : 'Station'}
          </h1>
          {stationInfo.data && (
            <p className="mt-1 text-white/90">
              {stationInfo.data.available_boards.length > 0
                ? `${stationInfo.data.available_boards.length} planche(s) disponible(s)`
                : 'Aucune planche disponible pour le moment'}
              {stationInfo.data.online === false && ' · station hors ligne, la location reste possible'}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-md space-y-4 px-4">
        {stationInfo.error && <ErrorNote error={stationInfo.error.message} />}
        {!token && <SignUp onLogged={onLogged} referral={params.get('ref') || ''} />}
        {token && !me.data && !me.error && <Spinner />}
        {token && me.data && me.data.card_hold_status !== 'authorized' && <CardStep onDone={me.reload} />}
        {token && me.data && me.data.card_hold_status === 'authorized' && (
          <Rental station={station} me={me.data} reload={me.reload} available={stationInfo.data?.available_boards || []} />
        )}
        {token && me.data && <WalletCard me={me.data} station={station} />}
        {stationInfo.data && (
          <p className="px-2 text-center text-xs text-ocean-700/70">
            Un souci ? Exploitant : {stationInfo.data.operator_phone}. Tu n'es jamais facturé au-delà de ton retour.
          </p>
        )}
      </main>
      <SmsInbox phone={phone} />
    </div>
  )
}

function SignUp({ onLogged, referral }) {
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
        <h2 className="font-display text-xl font-semibold">Ton numéro, et c'est tout</h2>
        <p className="mt-1 text-sm text-ocean-700">Pas de mot de passe, pas d'appli : ton téléphone est ton compte.</p>
        <form onSubmit={send} className="mt-4 space-y-3">
          <label className="label" htmlFor="phone">Numéro de téléphone</label>
          <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" required
            placeholder="06 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <ErrorNote error={error} />
          <Button className="w-full" busy={busy}>Recevoir mon code par SMS</Button>
        </form>
      </Card>
    )
  }
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">Code reçu par SMS</h2>
      <p className="mt-1 text-sm text-ocean-700">Envoyé au {sent.phone}.</p>
      {sent.demo_code && (
        <p className="mt-3 rounded-xl bg-sand-100 px-4 py-3 text-sm">
          Démo : ton code est <strong className="font-mono text-lg tracking-widest">{sent.demo_code}</strong>
        </p>
      )}
      <form onSubmit={verify} className="mt-4 space-y-3">
        <label className="label" htmlFor="code">Code à 4 chiffres</label>
        <input id="code" className="input text-center font-mono text-2xl tracking-[.5em]" inputMode="numeric"
          maxLength={4} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <label className="label" htmlFor="ref">Code de parrainage d'un ami (facultatif)</label>
        <input id="ref" className="input uppercase" placeholder="SURF-7K2P" value={ref}
          onChange={(e) => setRef(e.target.value)} />
        <ErrorNote error={error} />
        <Button className="w-full" busy={busy}>Valider</Button>
        <button type="button" className="w-full text-sm text-ocean-700 underline" onClick={() => setSent(null)}>
          Changer de numéro
        </button>
      </form>
    </Card>
  )
}

function CardStep({ onDone }) {
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
      <h2 className="font-display text-xl font-semibold">Ta carte, une seule fois</h2>
      <p className="mt-1 text-sm text-ocean-700">
        Empreinte de 300 € à chaque location, jamais débitée sauf si la planche n'est pas rendue et après vérification.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="label" htmlFor="card">Carte bancaire (fictive en démo)</label>
        <input id="card" className="input font-mono" inputMode="numeric" value={number}
          onChange={(e) => setNumber(e.target.value)} />
        <ErrorNote error={error} />
        <Button className="w-full" busy={busy}>Enregistrer ma carte</Button>
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
      <h2 className="font-display text-xl font-semibold">Prêt à surfer ?</h2>
      <p className="mt-1 text-sm text-ocean-700">0,20 € la minute, 30 € maximum par jour. Le compteur démarre quand la planche quitte le rack.</p>
      {showPack ? (
        <div className="mt-4">
          <label className="label" htmlFor="pack">Code pack ou partenaire</label>
          <input id="pack" className="input uppercase" placeholder="MAIF-SURF" value={pack} onChange={(e) => setPack(e.target.value)} />
        </div>
      ) : (
        <button className="mt-3 text-sm font-medium text-ocean-500 underline" onClick={() => setShowPack(true)}>
          J'ai un code pack
        </button>
      )}
      <div className="mt-4"><ErrorNote error={error} /></div>
      <Button className="mt-3 w-full text-lg" busy={busy} disabled={!available.length} onClick={rent}>
        {available.length ? 'Louer une planche' : 'Aucune planche libre ici'}
      </Button>
    </Card>
  )
}

function Armed({ rental, reload }) {
  const [busy, setBusy] = useState(false)
  const cancel = async () => { setBusy(true); try { await api.cancelRental(rental.id) } finally { await reload(); setBusy(false) } }
  return (
    <Card tone="ocean" className="text-center">
      <div className="text-sm uppercase tracking-widest text-white/80">C'est à toi</div>
      <div className="mt-2 font-display text-4xl font-bold">Prends {rental.board_id}</div>
      <p className="mt-3 text-white/90">Décroche-la du rack : le compteur démarre dès qu'elle s'éloigne.</p>
      {rental.pack_code && <p className="mt-2 text-sm text-white/80">Pack {rental.pack_code} appliqué.</p>}
      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/80">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> En attente du départ
      </div>
      <Button variant="light" className="mt-4 w-full" busy={busy} onClick={cancel}>Annuler</Button>
    </Card>
  )
}

function Live({ rental, station, reload }) {
  const live = rental.live || {}
  const [manual, setManual] = useState(false)
  const overdue = rental.status === 'not_returned'
  return (
    <>
      <Card tone={overdue ? 'coral' : 'ocean'}>
        <div className="flex items-center justify-between text-sm text-white/80">
          <span>{overdue ? 'Planche non rendue' : 'Session en cours'}</span>
          <span className="font-mono">{rental.board_id}</span>
        </div>
        <div className="mt-2 font-display text-5xl font-bold tabular-nums">{formatDuration(rental.duration_s)}</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-white/70">Prix actuel</div>
            <div className="text-xl font-semibold"><Money cents={live.charged_cents} /></div>
          </div>
          <div className="rounded-xl bg-white/10 p-3">
            <div className="text-white/70">{live.pack_minutes ? 'Offert par ton pack' : 'Cagnotte utilisée'}</div>
            <div className="text-xl font-semibold">
              {live.pack_minutes ? `${live.pack_minutes} min` : <Money cents={live.wallet_used_cents} />}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/90">
          {overdue
            ? "Raccroche-la vite ou appelle l'exploitant. Ta caution n'est prélevée qu'après vérification."
            : 'Raccroche-la au rack en sortant de l\'eau : c\'est fini, rien à confirmer.'}
        </p>
      </Card>
      {manual ? (
        <ManualReturn rental={rental} station={station} reload={reload} />
      ) : (
        <button className="w-full text-center text-sm text-ocean-700 underline" onClick={() => setManual(true)}>
          Planche raccrochée mais pas de SMS après 2 minutes ?
        </button>
      )}
    </>
  )
}

function ManualReturn({ rental, station, reload }) {
  const [qr, setQr] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const rack = session.recentRack() || station
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await api.manualReturn(rental.id, rack, qr); await reload() } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <Card>
      <h3 className="font-semibold">Retour de secours</h3>
      <p className="mt-1 text-sm text-ocean-700">
        QR du rack {rack} scanné. Scanne maintenant le QR gravé sur ta planche.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <input className="input font-mono" placeholder={rental.board_id} value={qr} onChange={(e) => setQr(e.target.value)} required />
        <ErrorNote error={error} />
        <Button className="w-full" busy={busy}>Rendre ma planche</Button>
      </form>
    </Card>
  )
}

function Receipt({ rental, reload }) {
  const r = rental.receipt
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Merci, planche rendue</h2>
        <span className="rounded-full bg-ocean-100 px-2 py-1 text-xs font-semibold text-ocean-700">Reçu</span>
      </div>
      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Planche" value={rental.board_id} />
        <Row label="Durée" value={r.duration_label} />
        {r.pack_minutes > 0 && <Row label="Offert par le pack" value={`${r.pack_minutes} min`} />}
        {r.wallet_used_cents > 0 && <Row label="Cagnotte" value={<>- <Money cents={r.wallet_used_cents} /></>} />}
        <Row label="Payé" value={<strong><Money cents={r.charged_cents} /></strong>} />
        <Row label="Caution" value="libérée" />
        {rental.return_mode === 'manual' && <Row label="Retour" value="par QR" />}
      </dl>
      <PhotoReturn rental={rental} reload={reload} />
    </Card>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-sand-200 py-1 last:border-0">
      <dt className="text-ocean-700">{label}</dt><dd>{value}</dd>
    </div>
  )
}

export function PhotoReturn({ rental, reload }) {
  const [file, setFile] = useState(null)
  const [qr, setQr] = useState(rental.board_id || '')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const send = async () => {
    setBusy(true); setError(null)
    try {
      const img = file ? await fileToBase64(file) : ''
      const r = await api.uploadPhoto(rental.id, qr, img)
      setResult(r)
      if (reload) await reload()
    } catch (err) { setError(err.message) }
    setBusy(false)
  }
  if (!result && rental.photo_credited) {
    return <p className="mt-4 rounded-xl bg-ocean-50 p-3 text-sm font-semibold text-ocean-700">Photo reçue, 1 € déjà ajouté à ta cagnotte. Merci !</p>
  }
  if (result) {
    return (
      <div className="mt-4 rounded-xl bg-ocean-50 p-3 text-sm">
        <p className="font-semibold text-ocean-700">{result.message}</p>
        <p className="mt-1 text-ocean-700/80">
          Diagnostic : {result.ai_result.damages.length ? 'dommage à vérifier par l\'exploitant' : 'aucun dommage visible'}
          {' · '}empreinte {result.sha256.slice(0, 10)}…
        </p>
      </div>
    )
  }
  return (
    <div className="mt-4 rounded-xl border border-dashed border-cork-400 bg-sand-50 p-3">
      <p className="text-sm font-semibold">Photo de retour = 1 € sur ta prochaine session</p>
      <p className="text-xs text-ocean-700/80">Le QR gravé de la planche doit être visible. C'est aussi ta preuve qu'elle est en bon état.</p>
      <input type="file" accept="image/*" capture="environment" className="mt-3 block w-full text-sm"
        onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <label className="label mt-3" htmlFor="qr">QR lu sur la photo (démo)</label>
      <input id="qr" className="input font-mono" value={qr} onChange={(e) => setQr(e.target.value)} />
      <div className="mt-2"><ErrorNote error={error} /></div>
      <Button variant="cork" className="mt-2 w-full" busy={busy} onClick={send}>Envoyer la photo</Button>
    </div>
  )
}

function WalletCard({ me, station }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/s/${station}?ref=${me.referral_code}`
  const share = async () => {
    const text = `Surfe sur une planche en liège Grab&Surf : ${me.referral_code} te fait gagner 2 € sur ta première session.`
    try {
      if (navigator.share) await navigator.share({ title: 'Grab&Surf', text, url: link })
      else { await navigator.clipboard.writeText(`${text} ${link}`); setCopied(true) }
    } catch { /* share sheet closed */ }
  }
  return (
    <Card tone="sand">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-ocean-700">Ma cagnotte</div>
          <div className="font-display text-3xl font-bold"><Money cents={me.wallet_cents} /></div>
        </div>
        <div className="text-right text-xs text-ocean-700/80">
          Déduite de ta prochaine session
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-white p-3">
        <div className="text-sm text-ocean-700">Mon code de parrainage</div>
        <div className="font-mono text-2xl font-bold tracking-wider text-cork-600">{me.referral_code}</div>
        <p className="mt-1 text-xs text-ocean-700/80">2 € pour ton filleul tout de suite, 2 € pour toi après sa première session.</p>
        <Button variant="ghost" className="mt-3 w-full" onClick={share}>{copied ? 'Lien copié' : 'Partager mon code'}</Button>
      </div>
    </Card>
  )
}
