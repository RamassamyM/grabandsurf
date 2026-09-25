import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../../api.js'
import { Button, Card, ErrorNote, Money, Spinner, usePoll } from '../../components/ui.jsx'
import { StaffHeader } from '../operator/OperatorPage.jsx'

const URL_KEY = 'gs_qr_base_url'

// Owner (Notox): QR codes to print for racks and boards, and the repair price grid.
export default function OwnerPage() {
  const [tab, setTab] = useState('qr')
  return (
    <div className="min-h-dvh bg-sand-100">
      <StaffHeader active="owner" />
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <div className="flex gap-2 print:hidden">
          {[['qr', 'QR à imprimer'], ['fees', 'Forfaits de réparation']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-ocean-500 text-white' : 'bg-white text-ocean-700'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'qr' ? <QrSheet /> : <RepairFees />}
      </main>
    </div>
  )
}

function QrSheet() {
  const { data, error } = usePoll(() => api.qrCodes(), 30000, [])
  const [base, setBase] = useState(() => {
    try { return localStorage.getItem(URL_KEY) || window.location.origin } catch { return window.location.origin }
  })
  const saveBase = (v) => { setBase(v); try { localStorage.setItem(URL_KEY, v) } catch { /* private mode */ } }
  const localhost = /localhost|127\.0\.0\.1/.test(base)
  if (error) return <ErrorNote error={error.message} />
  if (!data) return <Spinner />
  const clean = base.replace(/\/+$/, '')
  return (
    <>
      <Card className="print:hidden">
        <label className="label" htmlFor="base">Adresse du site encodée dans les QR</label>
        <div className="flex flex-wrap gap-2">
          <input id="base" className="input max-w-md font-mono" value={base} onChange={(e) => saveBase(e.target.value)} />
          <Button onClick={() => window.print()}>Imprimer la planche de QR</Button>
        </div>
        {localhost && (
          <p className="mt-2 text-sm text-coral-600">
            « localhost » ne marche pas depuis un téléphone : mets l'adresse de cet ordinateur sur le Wi-Fi
            (par exemple http://192.168.8.20:9000) ou l'adresse publique du site.
          </p>
        )}
        <p className="mt-2 text-xs text-ocean-700/80">
          QR du rack : ouvre la location. QR de planche (gravé au laser) : passeport, retour de secours, photo et casse.
          La caméra du navigateur demande HTTPS (ou localhost) ; sinon le client prend le QR en photo.
        </p>
      </Card>
      <section>
        <h2 className="mb-2 font-display text-xl font-semibold print:mt-0">Racks</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
          {data.racks.map((r) => (
            <QrCard key={r.id} url={clean + r.path} title="Louer une planche" subtitle={r.label}
              note="Scanne · Scan · Escanea" big />
          ))}
        </div>
      </section>
      <section className="print:break-before-page">
        <h2 className="mb-2 font-display text-xl font-semibold">Planches</h2>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6 print:grid-cols-6">
          {data.boards.map((b) => (
            <QrCard key={b.id} url={clean + b.path} title={b.label} subtitle={`base ${b.home_station}`} />
          ))}
        </div>
      </section>
    </>
  )
}

function QrCard({ url, title, subtitle, note, big = false }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: big ? 480 : 240, errorCorrectionLevel: 'M',
      color: { dark: '#0B2B2E', light: '#FFFFFF' } }).then(setSrc).catch(() => setSrc(null))
  }, [url, big])
  return (
    <div className="break-inside-avoid rounded-2xl border-2 border-ocean-500 bg-white p-3 text-center">
      {big && <div className="font-display text-lg font-bold text-ocean-700">{title}</div>}
      {src ? <img src={src} alt={url} className="mx-auto w-full max-w-[220px]" /> : <div className="aspect-square" />}
      {!big && <div className="font-mono text-sm font-bold">{title}</div>}
      <div className="text-xs text-ocean-700">{subtitle}</div>
      {note && <div className="mt-1 text-xs font-semibold text-cork-600">{note}</div>}
      <div className="mt-1 break-all font-mono text-[10px] text-ocean-700/60">{url}</div>
    </div>
  )
}

function RepairFees() {
  const { data, error, reload } = usePoll(() => api.repairFees(), 60000, [])
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { if (data && !rows) setRows(data.zones.map((z) => ({ ...z, euros: (z.fee_cents / 100).toFixed(2) }))) }, [data, rows])
  if (error) return <ErrorNote error={error.message} />
  if (!data || !rows) return <Spinner />
  const update = (i, field, value) => setRows(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)))
  const save = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const zones = rows.map((r) => ({ zone: r.zone, label: r.label,
        fee_cents: Math.round(parseFloat(String(r.euros).replace(',', '.')) * 100) || 0 }))
      await api.saveRepairFees(zones)
      setRows(null); await reload(); setMsg('Grille enregistrée.')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }
  const pct = data.severity_percent
  return (
    <Card>
      <h2 className="font-display text-xl font-semibold">Forfaits de réparation</h2>
      <p className="mt-1 text-sm text-ocean-700">
        Prix de base par zone, pour une casse moyenne. L'IA et l'exploitant s'en servent pour proposer le forfait,
        ajusté selon la gravité : légère {pct.minor} %, moyenne {pct.moderate} %, grave {pct.severe} %.
        Le montant n'est retenu sur la caution qu'après validation par l'exploitant.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead><tr className="text-left text-ocean-700/70"><th className="py-1">Zone</th><th>Libellé</th><th>Moyenne (€)</th><th>Légère</th><th>Grave</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const cents = Math.round(parseFloat(String(r.euros).replace(',', '.')) * 100) || 0
            return (
              <tr key={r.zone} className="border-t border-sand-200">
                <td className="py-2 font-mono">{r.zone}</td>
                <td><input className="input py-2" value={r.label} onChange={(e) => update(i, 'label', e.target.value)} /></td>
                <td><input className="input w-28 py-2" inputMode="decimal" value={r.euros} onChange={(e) => update(i, 'euros', e.target.value)} /></td>
                <td><Money cents={Math.floor(cents * pct.minor / 100)} /></td>
                <td><Money cents={Math.floor(cents * pct.severe / 100)} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-3"><ErrorNote error={err} /></div>
      {msg && <p className="mt-2 text-sm font-semibold text-ocean-500">{msg}</p>}
      <Button className="mt-3" busy={busy} onClick={save}>Enregistrer la grille</Button>
    </Card>
  )
}
