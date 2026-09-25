import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Button, Card, ErrorNote, Logo, Money, Spinner, TxLink, fileToBase64, usePoll } from '../../components/ui.jsx'
import { PinGate } from '../operator/OperatorPage.jsx'

// Partner dashboard: aggregated figures and proofs, never a name.
export default function PartnerPage() {
  const { id } = useParams()
  const { data, error, reload } = usePoll(() => api.partnerDashboard(id), 3000, [id])

  if (error && error.status === 401) return <PinGate onSaved={reload} />
  if (error && !data) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <Logo />
        <Card className="mt-6"><ErrorNote error={error.status === 404 ? 'Partenaire inconnu.' : error.message} /></Card>
      </main>
    )
  }
  if (!data) return <main className="mx-auto max-w-md px-4"><Spinner /></main>

  const bought = data.hours_bought * 60
  const pct = bought ? Math.min(100, Math.round((data.minutes_used / bought) * 100)) : 0
  return (
    <div className="min-h-dvh pb-12">
      <header className="bg-ocean-500 px-4 pb-10 pt-6 text-white">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="inline-block rounded-lg bg-white/95 px-2 py-1"><Logo small /></Link>
          <div className="mt-6 text-sm uppercase tracking-widest text-white/80">Espace partenaire</div>
          <h1 className="font-display text-4xl font-bold">{data.partner.name}</h1>
          <p className="mt-2 max-w-xl text-white/90">{data.statement}</p>
        </div>
      </header>
      <main className="mx-auto -mt-6 max-w-3xl space-y-4 px-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Heures achetées" value={data.hours_bought} />
          <Kpi label="Minutes surfées" value={data.minutes_used} />
          <Kpi label="Sessions" value={data.sessions_count} />
          <Kpi label="Personnes" value={data.people_count} />
        </div>
        <Card>
          <div className="flex items-center justify-between text-sm">
            <span>Utilisation du pack</span><span className="font-semibold">{pct} %</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-sand-200">
            <div className="h-full rounded-full bg-cork-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-ocean-700/80">Montant du pack : <Money cents={data.amount_cents} /> · registre : {data.chain.label}</p>
        </Card>
        <Card>
          <h2 className="font-display text-xl font-semibold">Codes distribués</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-ocean-700/70"><th className="py-1">Code</th><th>Quota</th><th className="text-right">Utilisé</th></tr></thead>
            <tbody>
              {data.codes.map((c) => (
                <tr key={c.code} className="border-t border-sand-200">
                  <td className="py-1 font-mono">{c.code}</td><td>{c.minutes_quota} min</td>
                  <td className="text-right">{c.minutes_used} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="font-display text-xl font-semibold">Sessions et preuves</h2>
          {!data.sessions.length && <p className="mt-2 text-sm text-ocean-700/70">Aucune session pour l'instant. Les codes attendent leurs surfeurs.</p>}
          <ul className="mt-3 space-y-3">
            {data.sessions.map((s) => (
              <li key={s.rental_id} className="rounded-xl bg-sand-50 p-3 text-sm">
                <div className="flex justify-between">
                  <span><span className="font-mono">{s.board_id}</span> · code {s.code}</span>
                  <span className="font-semibold">{s.pack_minutes} min offertes</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3">
                  {s.proofs.map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs">{p.event_type} <TxLink hash={p.tx_hash} url={p.url} /></span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Sponsoring partnerId={id} />
      </main>
    </div>
  )
}

const SP_STATUS = { pending: 'En attente du propriétaire', active: 'Actif', rejected: 'Refusé', ended: 'Terminé' }
const NO_QUOTES = (v) => v.replace(/["\\]/g, '')

// Sponsor a board: the design of a local artist becomes the NFT image, names go on-chain.
function Sponsoring({ partnerId }) {
  const list = usePoll(() => api.partnerSponsorships(partnerId), 5000, [partnerId])
  const boards = usePoll(() => api.qrCodes(), 60000, [])
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Parrainer une planche</h2>
        {!open && <Button variant="cork" className="min-h-0 px-4 py-2 text-sm" onClick={() => setOpen(true)}>Nouveau parrainage</Button>}
      </div>
      <p className="mt-1 text-sm text-ocean-700">
        Offrez à une planche le design d'un artiste local. Après validation du propriétaire, le design devient l'image du NFT
        et le passeport public met en avant l'artiste et votre marque. Seuls les noms publics, le lien du design, son empreinte
        et les dates sont inscrits sur la chaîne.
      </p>
      {open && (
        <SponsorForm partnerId={partnerId} boards={boards.data?.boards || []}
          onDone={() => { setOpen(false); list.reload() }} onCancel={() => setOpen(false)} />
      )}
      <ul className="mt-4 space-y-3">
        {(list.data || []).map((sp) => <SponsorRow key={sp.id} sp={sp} />)}
      </ul>
      {list.data && !list.data.length && !open && <p className="mt-3 text-sm text-ocean-700/70">Aucun parrainage pour l'instant.</p>}
    </Card>
  )
}

export function SponsorRow({ sp, children }) {
  return (
    <li className="flex gap-3 rounded-xl bg-sand-50 p-3 text-sm">
      {sp.design_url && <img src={sp.design_url} alt="" className="h-20 w-20 shrink-0 rounded-lg bg-white object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/p/${sp.board_id}`} className="font-mono font-semibold underline decoration-dotted">{sp.board_id}</Link>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold">{SP_STATUS[sp.status] || sp.status}</span>
        </div>
        <div>{sp.sponsor_name} · design {sp.artist_name}</div>
        <div className="text-xs text-ocean-700/80">
          du {sp.start_date}{sp.end_date ? ` au ${sp.end_date}` : ''} · {sp.media.length} média(s)
          {sp.stats && <> · {sp.stats.passport_views} vue(s) du passeport · {sp.stats.sessions} session(s) · {sp.stats.minutes_surfed} min surfées</>}
        </div>
        {sp.chain?.status && <div className="mt-1 flex items-center gap-2 text-xs">SPONSORING <TxLink hash={sp.chain.tx_hash} url={sp.chain.url} /></div>}
        {children}
      </div>
    </li>
  )
}

function SponsorForm({ partnerId, boards, onDone, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ board_id: '', sponsor_name: '', sponsor_url: '', message: '', artist_name: '',
    artist_bio: '', start_date: today, end_date: '' })
  const [design, setDesign] = useState(null)
  const [images, setImages] = useState([])
  const [videos, setVideos] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, clean = (v) => v) => (e) => setF({ ...f, [k]: clean(e.target.value) })
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const media = [
        ...(await Promise.all(images.map(async (file) => ({ kind: 'image', image_base64: await fileToBase64(file), caption: file.name.replace(/\.[^.]+$/, '').slice(0, 160) })))),
        ...videos.split('\n').map((v) => v.trim()).filter(Boolean).map((url) => ({ kind: 'video', url })),
      ]
      await api.submitSponsorship(partnerId, { ...f, board_id: f.board_id || boards[0]?.id, design_base64: await fileToBase64(design), media })
      onDone()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-sand-200 p-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="sp-board">Planche</label>
        <select id="sp-board" className="input" value={f.board_id || boards[0]?.id || ''} onChange={set('board_id')}>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.id} (base {b.home_station})</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sp-sponsor">Nom public du sponsor (sur la chaîne)</label>
        <input id="sp-sponsor" className="input" required minLength={2} maxLength={80} value={f.sponsor_name} onChange={set('sponsor_name', NO_QUOTES)} />
      </div>
      <div>
        <label className="label" htmlFor="sp-artist">Nom public de l'artiste (sur la chaîne)</label>
        <input id="sp-artist" className="input" required minLength={2} maxLength={80} value={f.artist_name} onChange={set('artist_name', NO_QUOTES)} />
      </div>
      <div>
        <label className="label" htmlFor="sp-url">Lien du sponsor</label>
        <input id="sp-url" className="input" type="url" placeholder="https://" maxLength={200} value={f.sponsor_url} onChange={set('sponsor_url')} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="sp-bio">Présentation de l'artiste</label>
        <textarea id="sp-bio" className="input" rows={2} maxLength={400} value={f.artist_bio} onChange={set('artist_bio')} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="sp-msg">Message du sponsor sur le passeport</label>
        <input id="sp-msg" className="input" maxLength={280} value={f.message} onChange={set('message')} />
      </div>
      <div>
        <label className="label" htmlFor="sp-start">Début</label>
        <input id="sp-start" className="input" type="date" required value={f.start_date} onChange={set('start_date')} />
      </div>
      <div>
        <label className="label" htmlFor="sp-end">Fin (facultatif)</label>
        <input id="sp-end" className="input" type="date" min={f.start_date} value={f.end_date} onChange={set('end_date')} />
      </div>
      <div>
        <label className="label" htmlFor="sp-design">Design de la planche (image, 4 Mo max)</label>
        <input id="sp-design" className="input" type="file" accept="image/*" required onChange={(e) => setDesign(e.target.files?.[0] || null)} />
      </div>
      <div>
        <label className="label" htmlFor="sp-gallery">Photos de l'artiste et de son travail</label>
        <input id="sp-gallery" className="input" type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 6))} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="sp-videos">Vidéos (liens https, un par ligne)</label>
        <textarea id="sp-videos" className="input font-mono text-xs" rows={2} value={videos} onChange={(e) => setVideos(e.target.value)} />
      </div>
      <div className="sm:col-span-2"><ErrorNote error={err} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <Button busy={busy} disabled={!design}>Envoyer au propriétaire</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  )
}

function Kpi({ label, value }) {
  return (
    <Card className="text-center">
      <div className="font-display text-3xl font-bold text-ocean-700">{value}</div>
      <div className="text-xs text-ocean-700/80">{label}</div>
    </Card>
  )
}
