import { Link, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Card, ErrorNote, Logo, Money, Spinner, TxLink, usePoll } from '../../components/ui.jsx'

// Partner dashboard: aggregated figures and proofs, never a name.
export default function PartnerPage() {
  const { id } = useParams()
  const { data, error } = usePoll(() => api.partnerDashboard(id), 3000, [id])

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
      </main>
    </div>
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
