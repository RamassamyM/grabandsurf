import { useState } from 'react'
import { api } from '../../api.js'
import { Button, Card, ErrorNote, Money, Spinner, usePoll } from '../../components/ui.jsx'
import { DamageReview, PhotoDiagnosis, PinGate, StaffHeader, useRole } from './OperatorPage.jsx'

const SEVERITIES = [['minor', 'légère'], ['moderate', 'moyenne'], ['severe', 'grave']]

// Inspection: every returned session keeps its deposit until the state is checked here
// (or automatically after 8 h, or when the next rental of the board leaves without a report).
export default function InspectionPage() {
  const { data, error, reload } = usePoll(() => api.inspections(), 3000, [])
  const [role, setRole] = useRole()
  if (error && error.status === 401) return <PinGate onSaved={reload} />
  return (
    <div className="min-h-dvh bg-sand-100">
      <StaffHeader role={role} setRole={setRole} />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <Card tone="ocean">
          <h1 className="font-display text-2xl font-semibold">Inspection des retours</h1>
          <p className="mt-1 text-white/90">
            Le prix est prélevé au retour ; le reste de la caution attend la vérification de la planche.
            Valide l'état pour libérer la caution, ou retiens un forfait de réparation. Sans action, la caution
            est libérée au bout de 8 h, ou dès la location suivante de la planche sans signalement.
          </p>
        </Card>
        {error && <ErrorNote error={error.message} />}
        {!data ? <Spinner /> : (
          <>
            <h2 className="font-display text-xl font-semibold">À vérifier ({data.pending.length})</h2>
            {!data.pending.length && <Card><span className="text-ocean-700">Aucune caution en attente : tout est vérifié.</span></Card>}
            {data.pending.map((s) => <SessionCard key={s.id} session={s} data={data} role={role} reload={reload} />)}
            <h2 className="pt-4 font-display text-xl font-semibold">Déjà traitées</h2>
            {!data.checked.length && <Card><span className="text-ocean-700/70">Rien pour l'instant.</span></Card>}
            {data.checked.map((s) => <DoneRow key={s.id} session={s} />)}
          </>
        )}
      </main>
    </div>
  )
}

function SessionCard({ session: s, data, role, reload }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [withhold, setWithhold] = useState(false)
  const openReports = s.damage_reports.filter((d) => d.status === 'to_review')
  const release = async () => {
    setBusy(true); setError(null)
    try { await api.releaseDeposit(s.id, role); await reload() } catch (e) { setError(e.message) }
    setBusy(false)
  }
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-lg font-semibold">{s.board_id}</span>
          <span className="ml-2 text-sm text-ocean-700">{s.customer} · {s.duration_label} · {s.start_station} vers {s.end_station}
            {s.return_mode === 'manual' ? ' · retour par QR' : ''}</span>
        </div>
        <div className="text-sm">
          Payé <strong><Money cents={s.charged_cents} /></strong> · caution restante <strong><Money cents={s.deposit_left_cents} /></strong>
          {s.auto_release_in && <span className="text-ocean-700/70"> · libération auto dans {s.auto_release_in}</span>}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {s.photos.length === 0 && <p className="text-sm text-ocean-700/70">Pas de photo de retour : vérifier la planche au rack.</p>}
        {s.photos.map((p) => <PhotoDiagnosis key={p.id} photo={p} compact />)}
      </div>
      {openReports.length > 0 && (
        <ul className="mt-3 space-y-2">
          {openReports.map((d) => <DamageReview key={d.id} report={{ ...d, board_id: s.board_id, rental_id: s.id }} role={role} reload={reload} />)}
        </ul>
      )}
      <div className="mt-3"><ErrorNote error={error} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button busy={busy} disabled={openReports.length > 0} onClick={release}>Valider l'état et libérer la caution</Button>
        <Button variant="ghost" onClick={() => setWithhold(!withhold)}>Retenir un forfait de réparation</Button>
      </div>
      {openReports.length > 0 && <p className="mt-1 text-xs text-ocean-700/70">Valide ou refuse d'abord la casse signalée.</p>}
      {withhold && <WithholdForm session={s} data={data} role={role} reload={reload} />}
    </Card>
  )
}

function WithholdForm({ session: s, data, role, reload }) {
  const suggestedFor = (zone, severity) => {
    const base = data.repair_zones.find((z) => z.zone === zone)?.fee_cents || 0
    return Math.floor(base * (data.severity_percent[severity] || 100) / 100)
  }
  const photoAction = s.photos[0]?.suggestion?.actions?.[0]
  const [zone, setZone] = useState(photoAction?.zone || data.repair_zones[0]?.zone || 'other')
  const [severity, setSeverity] = useState(photoAction?.severity || 'moderate')
  const [euros, setEuros] = useState((suggestedFor(zone, severity) / 100).toFixed(2))
  const [description, setDescription] = useState(photoAction?.description || '')
  const [workshop, setWorkshop] = useState(severity !== 'minor')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const pick = (z, sv) => { setZone(z); setSeverity(sv); setEuros((suggestedFor(z, sv) / 100).toFixed(2)); setWorkshop(sv !== 'minor') }
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.withhold(s.id, { role, zone, severity, description, send_to_workshop: workshop,
        fee_cents: Math.round(parseFloat(String(euros).replace(',', '.')) * 100) || 0 })
      await reload()
    } catch (e) { setError(e.message) }
    setBusy(false)
  }
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-sand-50 p-3 text-sm sm:grid-cols-2">
      <label>Zone
        <select className="input mt-1 py-2" value={zone} onChange={(e) => pick(e.target.value, severity)}>
          {data.repair_zones.map((z) => <option key={z.zone} value={z.zone}>{z.zone}</option>)}
        </select>
      </label>
      <label>Gravité
        <select className="input mt-1 py-2" value={severity} onChange={(e) => pick(zone, e.target.value)}>
          {SEVERITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label>Forfait retenu (€, plafonné à la caution restante)
        <input className="input mt-1 py-2" value={euros} onChange={(e) => setEuros(e.target.value)} />
      </label>
      <label>Constat
        <input className="input mt-1 py-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex. éclat de 2 cm sur le rail gauche" />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={workshop} onChange={(e) => setWorkshop(e.target.checked)} /> envoyer la planche à l'atelier</label>
      <div className="sm:col-span-2"><ErrorNote error={error} /></div>
      <Button variant="danger" busy={busy} onClick={submit}>Retenir <Money cents={Math.round(parseFloat(String(euros).replace(',', '.')) * 100) || 0} /> et libérer le reste</Button>
    </div>
  )
}

function DoneRow({ session: s }) {
  const charged = s.damage_reports.filter((d) => d.charged)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2 text-sm shadow-card">
      <span><span className="font-mono font-semibold">{s.board_id}</span> · {s.duration_label} · payé <Money cents={s.charged_cents} /></span>
      <span>
        caution {s.deposit_label}
        {charged.map((d) => <span key={d.id}> · {d.zone} <Money cents={d.fee_cents} /></span>)}
        {s.checked_role && <span className="text-ocean-700/70"> · par rôle {s.checked_role}</span>}
      </span>
    </div>
  )
}
