import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, session } from '../../api.js'
import { Button, Card, ErrorNote, Logo, Spinner, StatusBadge, TxLink, usePoll } from '../../components/ui.jsx'
import { PhotoReturn } from '../client/StationPage.jsx'

const ZONES = [['nose', 'Nose (avant)'], ['tail', 'Tail (arrière)'], ['rail', 'Rail (bord)'], ['fin', 'Aileron'], ['deck', 'Pont']]

// Public passport opened by the QR engraved on the board.
export default function PassportPage() {
  const { board } = useParams()
  const { data, error } = usePoll(() => api.passport(board), 4000, [board])
  const me = usePoll(() => (session.token() ? api.me() : Promise.resolve(null)), 4000, [board])

  if (error && !data) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Logo />
        <Card className="mt-6"><ErrorNote error={error.status === 404 ? 'Cette planche est inconnue.' : error.message} /></Card>
      </main>
    )
  }
  if (!data) return <main className="mx-auto max-w-md px-4"><Spinner /></main>

  const b = data.board
  const mine = me.data?.current_rental?.board_id === b.id ? me.data.current_rental : null
  const lastMine = me.data?.history?.find((r) => r.board_id === b.id)

  return (
    <div className="min-h-dvh pb-16">
      <header className="cork-texture px-4 pb-10 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <Link to="/" className="inline-block rounded-lg bg-white/90 px-2 py-1"><Logo small /></Link>
          <div className="mt-8 text-sm uppercase tracking-widest text-white/80">Passeport de planche</div>
          <h1 className="font-display text-5xl font-bold">{b.id}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={b.status} label={b.status_label} />
            <span className="text-white/90">{b.material} · base {b.home_station} · NFT n°{b.token_id}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-5 max-w-md space-y-4 px-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat value={data.sessions} label="sessions" />
          <Stat value={data.minutes_surfed} label="minutes surfées" />
          <Stat value={data.repairs} label="réparations" />
        </div>

        {data.ambassador && (
          <Card tone="ocean">
            <div className="text-sm text-white/70">Son ambassadrice ou ambassadeur</div>
            <div className="mt-1 font-display text-2xl font-semibold">{data.ambassador.name}</div>
            <div className="text-sm text-white/80">{data.ambassador.tagline}</div>
            <p className="mt-3 italic text-white/95">« {data.ambassador.story} »</p>
            <p className="mt-2 text-xs text-white/60">Personnage fictif.</p>
          </Card>
        )}

        {mine && mine.status !== 'armed' && <ReturnHere rental={mine} board={b.id} />}
        {!mine && lastMine && lastMine.status === 'returned' && !lastMine.photo_credited && (
          <Card><PhotoReturn rental={lastMine} reload={me.reload} /></Card>
        )}

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">Son carnet de vie</h2>
            <span className="text-xs text-ocean-700/70">{data.chain.label}</span>
          </div>
          <p className="mt-1 text-xs text-ocean-700/80">
            Chaque étape est inscrite dans un registre public : elle ne peut plus être modifiée, seulement corrigée par une nouvelle entrée.
          </p>
          {data.history.length === 0 && <p className="mt-4 text-sm text-ocean-700/70">Pas encore de sortie : elle attend sa première vague.</p>}
          <ol className="mt-4 space-y-3 border-l-2 border-cork-300 pl-4">
            {data.history.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-cork-400" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{h.label}</span>
                  <span className="text-xs text-ocean-700/70">station {h.station || '-'} · t = {Math.round(h.t)} s</span>
                </div>
                <TxLink hash={h.tx_hash} url={h.url} />
              </li>
            ))}
          </ol>
          {data.chain.contract_url && (
            <a className="mt-4 block text-sm text-ocean-500 underline" href={data.chain.contract_url} target="_blank" rel="noreferrer">
              Voir le registre sur Snowtrace ↗
            </a>
          )}
        </Card>

        <ShareCard text={data.share_text} />
        <DamageCard board={b.id} />
      </main>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <Card className="text-center">
      <div className="font-display text-3xl font-bold text-ocean-700">{value}</div>
      <div className="text-xs text-ocean-700/80">{label}</div>
    </Card>
  )
}

function ShareCard({ text }) {
  const [done, setDone] = useState(false)
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Grab&Surf', text, url: window.location.href })
      else { await navigator.clipboard.writeText(`${text} ${window.location.href}`); setDone(true) }
    } catch { /* closed */ }
  }
  return <Button variant="cork" className="w-full" onClick={share}>{done ? 'Lien copié' : 'Partager son histoire'}</Button>
}

function ReturnHere({ rental, board }) {
  const rack = session.recentRack()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const submit = async () => {
    setBusy(true); setError(null)
    try { await api.manualReturn(rental.id, rack, board); setDone(true) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  if (done) return <Card tone="sand"><p className="font-semibold">Planche rendue. Ton reçu arrive par SMS.</p></Card>
  return (
    <Card tone="sand">
      <h3 className="font-semibold">Rendre ma planche</h3>
      {rack ? (
        <>
          <p className="mt-1 text-sm text-ocean-700">Rack {rack} scanné il y a moins de 5 minutes. On ferme ta session maintenant.</p>
          <div className="mt-2"><ErrorNote error={error} /></div>
          <Button className="mt-3 w-full" busy={busy} onClick={submit}>Confirmer le retour</Button>
        </>
      ) : (
        <p className="mt-1 text-sm text-ocean-700">Scanne d'abord le QR du rack où tu la raccroches, puis reviens ici.</p>
      )}
    </Card>
  )
}

function DamageCard({ board }) {
  const [open, setOpen] = useState(false)
  const [zone, setZone] = useState('nose')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  if (!session.token()) return null
  const send = async () => {
    setBusy(true); setError(null)
    try { await api.reportDamage(board, zone); setMsg("Merci, l'exploitant va vérifier. La planche n'est plus proposée en attendant.") }
    catch (err) { setError(err.message) }
    setBusy(false)
  }
  if (!open) return <button className="w-full text-center text-sm text-ocean-700 underline" onClick={() => setOpen(true)}>Signaler une casse</button>
  return (
    <Card>
      <h3 className="font-semibold">Signaler une casse</h3>
      {msg ? <p className="mt-2 text-sm">{msg}</p> : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ZONES.map(([z, label]) => (
              <button key={z} onClick={() => setZone(z)}
                className={`rounded-xl border px-3 py-2 text-sm ${zone === z ? 'border-ocean-500 bg-ocean-50 font-semibold' : 'border-sand-300'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2"><ErrorNote error={error} /></div>
          <Button variant="danger" className="mt-3 w-full" busy={busy} onClick={send}>Envoyer le signalement</Button>
        </>
      )}
    </Card>
  )
}
