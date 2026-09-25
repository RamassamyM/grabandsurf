import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { api, session } from '../../api.js'
import { Button, Card, ErrorNote, Logo, Money, Spinner, StatusBadge, TxLink, formatDuration, usePoll } from '../../components/ui.jsx'

const ROLES = [['exploitant', 'Exploitant'], ['tournee', 'Tournée'], ['reparateur', 'Réparateur'], ['ecole', 'École de surf']]
const ALERT_ICONS = { theft: '🚨', not_returned: '⏱', station_offline: '📡', damage: '🩹', unknown_board: '❓' }

// Operator dashboard: one page, refreshed every 2 seconds.
const ROLE_KEY = 'gs_operator_role'

// The validator's role (never a name), shared by the staff pages.
export function useRole() {
  const [role, setRoleState] = useState(() => {
    try { return localStorage.getItem(ROLE_KEY) || 'exploitant' } catch { return 'exploitant' }
  })
  const setRole = (r) => { setRoleState(r); try { localStorage.setItem(ROLE_KEY, r) } catch { /* private mode */ } }
  return [role, setRole]
}

export function StaffHeader({ role, setRole, children }) {
  const links = [['/operator', 'Tableau de bord'], ['/operator/inspection', 'Inspection'], ['/owner', 'Propriétaire']]
  return (
    <header className="bg-ocean-900 text-white print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/app" className="rounded-lg bg-white/95 px-2 py-1"><Logo small /></Link>
          <nav className="flex gap-1 text-sm">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end className={({ isActive }) =>
                `rounded-lg px-3 py-1 ${isActive ? 'bg-white/20 font-semibold' : 'text-white/80 hover:bg-white/10'}`}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {setRole && (
            <label className="flex items-center gap-2">
              Rôle
              <select className="rounded-lg bg-white/10 px-2 py-1" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map(([v, l]) => <option key={v} value={v} className="text-ocean-900">{l}</option>)}
              </select>
            </label>
          )}
          {children}
        </div>
      </div>
    </header>
  )
}

export default function OperatorPage() {
  const { data, error, reload } = usePoll(() => api.fleet(), 2000, [])
  const photos = usePoll(() => api.photos(), 4000, [])
  const [role, setRole] = useRole()
  const [sound, setSound] = useState(false)
  useAlarmBeep(data, sound)

  if (error && error.status === 401) return <PinGate onSaved={reload} />
  return (
    <div className="min-h-dvh bg-sand-100">
      <StaffHeader role={role} setRole={setRole}>
        <button onClick={() => setSound(!sound)} className="rounded-lg bg-white/10 px-3 py-1">
          {sound ? '🔔 Son activé' : '🔕 Activer le son'}
        </button>
        {data && <span className="text-white/70">t = {Math.round(data.now_t)} s</span>}
      </StaffHeader>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        {error && <ErrorNote error={error.message} />}
        {!data ? <Spinner /> : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Missions missions={data.missions} />
              <Card>
                <div className="text-sm text-ocean-700">Chiffre d'affaires</div>
                <div className="font-display text-4xl font-bold"><Money cents={data.revenue_cents} /></div>
                <div className="mt-1 text-xs text-ocean-700/70">{data.rentals.length} location(s) terminée(s) récemment</div>
                <Stations stations={data.stations} />
              </Card>
            </div>
            {data.deposits_to_check > 0 && (
              <Link to="/operator/inspection" className="block">
                <Card className="border-2 border-cork-400">
                  <span className="font-semibold">{data.deposits_to_check} caution(s) à vérifier</span>
                  <span className="text-sm text-ocean-700"> : valider l'état des planches rendues ou retenir un forfait de réparation. Ouvrir l'inspection ›</span>
                </Card>
              </Link>
            )}
            <Alerts alerts={data.alerts} reload={reload} />
            <Boards boards={data.boards} role={role} reload={reload} />
            <DamageReports reports={data.damage_reports} role={role} reload={reload} />
            <ReturnPhotos photos={photos.data || []} />
            <div className="grid gap-4 md:grid-cols-2">
              <Rentals rentals={data.rentals} />
              <Chain chain={data.chain} />
            </div>
            <ResetDemo reload={reload} />
          </>
        )}
      </main>
    </div>
  )
}

function useAlarmBeep(data, enabled) {
  const seen = useRef(null)
  useEffect(() => {
    if (!data) return
    const theft = data.alerts.filter((a) => a.kind === 'theft').map((a) => a.id)
    if (seen.current && enabled && theft.some((id) => !seen.current.includes(id))) beep()
    seen.current = theft
  }, [data, enabled])
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[0, 0.35, 0.7].forEach((start) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = 880
      g.gain.value = 0.15
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + 0.2)
    })
  } catch { /* no audio available */ }
}

function Missions({ missions }) {
  return (
    <Card tone="ocean" className="md:col-span-2">
      <div className="text-sm uppercase tracking-widest text-white/70">Missions du jour</div>
      <ol className="mt-3 space-y-3">
        {missions.map((m, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cork-400 font-bold">{i + 1}</span>
            <span className="text-lg leading-snug">{m}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function Stations({ stations }) {
  return (
    <div className="mt-4 space-y-1">
      {stations.map((s) => (
        <div key={s.id} className="flex items-center justify-between text-sm">
          <span>Station {s.id} · {s.name}</span>
          <span className={`flex items-center gap-1 font-medium ${s.online ? 'text-ocean-500' : s.online === false ? 'text-coral-600' : 'text-ocean-700/50'}`}>
            <span className={`h-2 w-2 rounded-full ${s.online ? 'bg-ocean-500' : s.online === false ? 'bg-coral-500' : 'bg-ocean-700/30'}`} />
            {s.online ? 'en ligne' : s.online === false ? 'hors ligne' : 'jamais vue'}
          </span>
        </div>
      ))}
    </div>
  )
}

function Alerts({ alerts, reload }) {
  if (!alerts.length) return <Card><span className="text-ocean-700">Aucune alerte. Tout va bien sur la plage.</span></Card>
  return (
    <Card className="border-2 border-coral-400">
      <h2 className="font-display text-xl font-semibold">Alertes ({alerts.length})</h2>
      <ul className="mt-3 divide-y divide-sand-200">
        {alerts.map((a) => (
          <li key={a.id} className={`flex items-center justify-between gap-3 py-2 ${a.kind === 'theft' ? 'font-semibold text-coral-600' : ''}`}>
            <span>{ALERT_ICONS[a.kind] || '•'} {a.message}</span>
            <button className="shrink-0 text-xs text-ocean-700 underline" onClick={async () => { await api.resolveAlert(a.id); reload() }}>
              Traitée
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Boards({ boards, role, reload }) {
  const [error, setError] = useState(null)
  const act = async (fn) => { setError(null); try { await fn(); await reload() } catch (e) { setError(e.message) } }
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">Planches</h2>
      <ErrorNote error={error} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((b) => (
          <div key={b.id} className="rounded-xl border border-sand-200 p-3">
            <div className="flex items-center justify-between">
              <Link to={`/p/${b.id}`} className="font-mono font-semibold underline decoration-dotted">{b.id}</Link>
              <StatusBadge status={b.status} label={b.status_label} />
            </div>
            <div className="mt-1 text-xs text-ocean-700/80">
              base {b.home_station}{b.current_station && b.current_station !== b.home_station ? ` · à ${b.current_station}` : ''}
              {' · '}{b.rentals_count} sortie(s) · depuis {b.since_label}
              {b.needs_review && ' · casse à vérifier'}
            </div>
            {b.rental && <div className="mt-1 text-xs">{b.rental.customer} · {formatDuration(b.rental.duration_s)}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              {['not_returned', 'unauthorized'].includes(b.status) && (
                <Button variant="danger" className="min-h-0 px-3 py-1 text-xs"
                  onClick={() => window.confirm(`Confirmer la perte de ${b.id} après vérification du rack ?`) && act(() => api.confirmLoss(b.id, role))}>
                  Confirmer la perte
                </Button>
              )}
              {b.status === 'unauthorized' && (
                <Button variant="ghost" className="min-h-0 px-3 py-1 text-xs"
                  onClick={() => {
                    const reason = window.prompt(`Faux départ de ${b.id} : la planche est bien au rack ? Motif (inscrit sur la chaîne, sans nom)`, 'Faux départ, planche vue au rack')
                    if (reason) act(() => api.correctDeparture(b.id, role, reason.replace(/["\\]/g, '')))
                  }}>
                  Corriger (faux départ)
                </Button>
              )}
              {['workshop', 'lost', 'sold'].includes(b.status) && (
                <Button variant="ghost" className="min-h-0 px-3 py-1 text-xs" onClick={() => act(() => api.backInService(b.id, role))}>
                  Remettre en service
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

const SEVERITY = { minor: 'légère', moderate: 'moyenne', severe: 'grave' }
const SOURCE = { photo_ai: 'IA photo', customer: 'client', inspection: 'inspection' }

function DamageReports({ reports, role, reload }) {
  if (!reports.length) return null
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">Casses à valider</h2>
      <p className="text-xs text-ocean-700/80">L'IA propose, l'exploitant décide. Seul le rôle du validateur est enregistré.</p>
      <ul className="mt-3 space-y-2">
        {reports.map((d) => <DamageReview key={d.id} report={d} role={role} reload={reload} />)}
      </ul>
    </Card>
  )
}

export function DamageReview({ report: d, role, reload }) {
  const [euros, setEuros] = useState((d.suggested_fee_cents / 100).toFixed(2))
  const [charge, setCharge] = useState(Boolean(d.rental_id))
  const [workshop, setWorkshop] = useState(d.severity !== 'minor')
  const [error, setError] = useState(null)
  const review = async (decision) => {
    setError(null)
    try {
      await api.reviewDamage(d.id, decision, role, {
        fee_cents: Math.round(parseFloat(String(euros).replace(',', '.')) * 100) || 0,
        charge, send_to_workshop: workshop,
      })
      reload()
    } catch (e) { setError(e.message) }
  }
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl bg-sand-50 p-3">
      {d.photo_id && <img src={api.photoImageUrl(d.photo_id)} alt="" className="h-20 w-20 rounded-lg object-cover" />}
      <div className="min-w-[200px] flex-1 text-sm">
        <div><strong className="font-mono">{d.board_id}</strong> · zone {d.zone} · gravité {SEVERITY[d.severity] || d.severity} · source {SOURCE[d.source] || d.source}</div>
        {d.description && <div className="text-ocean-700/80">{d.description}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1">Forfait
            <input className="w-20 rounded-lg border border-sand-300 px-2 py-1" value={euros} onChange={(e) => setEuros(e.target.value)} /> €
          </label>
          {d.rental_id && (
            <label className="flex items-center gap-1"><input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} /> retenir sur la caution</label>
          )}
          <label className="flex items-center gap-1"><input type="checkbox" checked={workshop} onChange={(e) => setWorkshop(e.target.checked)} /> envoyer à l'atelier</label>
        </div>
        <ErrorNote error={error} />
      </div>
      <span className="flex gap-2">
        <Button className="min-h-0 px-3 py-1 text-xs" onClick={() => review('confirm')}>Valider la casse</Button>
        <Button variant="ghost" className="min-h-0 px-3 py-1 text-xs" onClick={() => review('reject')}>Refuser</Button>
      </span>
    </li>
  )
}

const CONDITION = { good: 'bon état', worn: 'usée', damaged: 'abîmée', unclear: 'photo peu claire' }

export function PhotoDiagnosis({ photo, compact = false }) {
  const ai = photo.ai_result || {}
  const s = photo.suggestion || { actions: [] }
  return (
    <div className="flex flex-wrap gap-3 rounded-xl bg-sand-50 p-3 text-sm">
      {photo.has_image
        ? <a href={api.photoImageUrl(photo.id)} target="_blank" rel="noreferrer"><img src={api.photoImageUrl(photo.id)} alt="" className={`${compact ? 'h-20 w-20' : 'h-28 w-28'} rounded-lg object-cover`} /></a>
        : <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-sand-200 text-xs">sans image</div>}
      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-mono">{photo.board_id}</strong>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ai.engine === 'claude' ? 'bg-ocean-500 text-white' : 'bg-sand-200'}`}>
            {ai.engine === 'claude' ? 'IA Claude' : 'simulation'}
          </span>
          <span className="text-xs text-ocean-700/80">QR {ai.board_read || 'non lu'} · {CONDITION[ai.overall_condition] || ai.overall_condition} · confiance {Math.round((ai.confidence || 0) * 100)} %</span>
          {photo.rewarded && <span className="text-xs text-ocean-500">+1 € crédité</span>}
        </div>
        {ai.summary && <p className="mt-1 text-ocean-700">{ai.summary}</p>}
        <p className="mt-1 font-medium">{s.sentence}</p>
        {s.actions.length > 0 && (
          <ul className="mt-1 list-disc pl-5">
            {s.actions.map((a, i) => (
              <li key={i}>{a.action} ({a.zone}, gravité {SEVERITY[a.severity]}) : <Money cents={a.fee_cents} /></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ReturnPhotos({ photos }) {
  if (!photos.length) return null
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">Photos de retour et diagnostics</h2>
      <p className="text-xs text-ocean-700/80">Suggestions de réparation calculées avec la grille du propriétaire. Rien n'est retenu sans validation.</p>
      <div className="mt-3 space-y-2">{photos.slice(0, 6).map((p) => <PhotoDiagnosis key={p.id} photo={p} />)}</div>
    </Card>
  )
}

function Rentals({ rentals }) {
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">Locations terminées</h2>
      {!rentals.length && <p className="mt-2 text-sm text-ocean-700/70">Aucune location terminée pour l'instant.</p>}
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rentals.map((r) => (
            <tr key={r.id} className="border-b border-sand-200 last:border-0">
              <td className="py-1 font-mono">{r.board_id}</td>
              <td>{formatDuration(r.duration_s)}</td>
              <td>{r.status === 'bought' ? 'achat implicite' : r.return_mode === 'manual' ? 'retour QR' : 'retour détecté'}</td>
              <td className="text-right"><Money cents={r.charged_cents} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function Chain({ chain }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Blockchain</h2>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${chain.mode === 'real' ? 'bg-ocean-500 text-white' : 'bg-sand-200'}`}>{chain.label}</span>
      </div>
      {chain.contract_url
        ? <a href={chain.contract_url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs text-ocean-500 underline">{chain.contract}</a>
        : <p className="mt-1 text-xs text-ocean-700/70">{chain.reason}</p>}
      <p className="mt-1 text-xs">En attente d'écriture : {chain.pending}{chain.error ? ` · réseau : ${chain.error} (on réessaie)` : ''}</p>
      <ul className="mt-3 space-y-1 text-sm">
        {chain.txs.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span><span className="font-mono">{t.board_id}</span> {t.event_type} {t.station || '-'}</span>
            <TxLink hash={t.tx_hash} url={t.url} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ResetDemo({ reload }) {
  const [busy, setBusy] = useState(false)
  const reset = async () => {
    if (!window.confirm('Remettre la démo à zéro ? Les planches reviennent au rack. Le registre blockchain, lui, garde tout.')) return
    setBusy(true); try { await api.resetDemo(); await reload() } finally { setBusy(false) }
  }
  return <div className="pb-8 text-right"><Button variant="ghost" busy={busy} onClick={reset}>Remettre la démo à zéro</Button></div>
}

export function PinGate({ onSaved }) {
  const [pin, setPin] = useState('')
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <Logo />
      <Card className="mt-6">
        <form onSubmit={(e) => { e.preventDefault(); session.setPin(pin); onSaved() }} className="space-y-3">
          <label className="label" htmlFor="pin">Code PIN exploitant</label>
          <input id="pin" className="input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          <Button className="w-full">Entrer</Button>
        </form>
      </Card>
    </main>
  )
}
