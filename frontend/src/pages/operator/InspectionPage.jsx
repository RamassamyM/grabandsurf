import { useState } from 'react'
import { CheckCircle2, Clock, Loader2, ShieldCheck, Wrench } from 'lucide-react'
import { api } from '@/api.js'
import { PageTitle, PinGate, StaffLayout, useRole } from '@/components/Layout.jsx'
import { ErrorNote, Money, Spinner, usePoll } from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DamageReview, PhotoDiagnosis } from './OperatorPage.jsx'

const SEVERITIES = [['minor', 'légère'], ['moderate', 'moyenne'], ['severe', 'grave']]

// Inspection: every returned session keeps its deposit until the state is checked here
// (or automatically after 8 h, or when the next rental of the board leaves without a report).
export default function InspectionPage() {
  const { data, error, reload } = usePoll(() => api.inspections(), 3000, [])
  const [role, setRole] = useRole()
  if (error && error.status === 401) return <PinGate onSaved={reload} />
  return (
    <StaffLayout role={role} setRole={setRole}>
      <PageTitle kicker="Exploitant" title="Inspection des retours">
        Le prix est prélevé au retour ; le reste de la caution attend la vérification de la planche. Sans action,
        la caution est libérée au bout de 8 h, ou dès la location suivante de la planche sans signalement.
      </PageTitle>
      {error && <ErrorNote error={error.message} />}
      {!data ? <Spinner /> : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-extrabold">
              À vérifier <Badge variant={data.pending.length ? 'sun' : 'muted'}>{data.pending.length}</Badge>
            </h2>
            {!data.pending.length && (
              <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-muted-foreground shadow-soft">
                <CheckCircle2 className="h-5 w-5 text-ocean" /> Aucune caution en attente : tout est vérifié.
              </div>
            )}
            {data.pending.map((s) => <SessionCard key={s.id} session={s} data={data} role={role} reload={reload} />)}
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-extrabold">Déjà traitées</h2>
            {!data.checked.length && <p className="text-sm text-muted-foreground">Rien pour l'instant.</p>}
            {data.checked.length > 0 && (
              <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
                {data.checked.map((s) => <DoneRow key={s.id} session={s} />)}
              </div>
            )}
          </section>
        </>
      )}
    </StaffLayout>
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
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <div className="font-mono text-xl font-extrabold">{s.board_id}</div>
          <div className="text-sm text-muted-foreground">
            {s.customer} · {s.duration_label} · {s.start_station} vers {s.end_station}{s.return_mode === 'manual' ? ' · retour par QR' : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="muted">payé <Money cents={s.charged_cents} /></Badge>
          <Badge variant="ocean">caution <Money cents={s.deposit_left_cents} /></Badge>
          {s.auto_release_in && <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> auto dans {s.auto_release_in}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {s.photos.length === 0 && <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Pas de photo de retour : vérifier la planche au rack.</p>}
        {s.photos.map((p) => <PhotoDiagnosis key={p.id} photo={p} compact />)}
        {openReports.length > 0 && (
          <ul className="space-y-2">
            {openReports.map((d) => <DamageReview key={d.id} report={{ ...d, board_id: s.board_id, rental_id: s.id }} role={role} reload={reload} />)}
          </ul>
        )}
        <ErrorNote error={error} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || openReports.length > 0} onClick={release}>
            {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Valider l'état et libérer la caution
          </Button>
          <Button variant="outline" onClick={() => setWithhold(!withhold)}><Wrench /> Retenir un forfait de réparation</Button>
        </div>
        {openReports.length > 0 && <p className="text-xs text-muted-foreground">Valide ou refuse d'abord la casse signalée.</p>}
        {withhold && <WithholdForm session={s} data={data} role={role} reload={reload} />}
      </CardContent>
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
  const cents = Math.round(parseFloat(String(euros).replace(',', '.')) * 100) || 0
  const pick = (z, sv) => { setZone(z); setSeverity(sv); setEuros((suggestedFor(z, sv) / 100).toFixed(2)); setWorkshop(sv !== 'minor') }
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      await api.withhold(s.id, { role, zone, severity, description, send_to_workshop: workshop, fee_cents: cents })
      await reload()
    } catch (e) { setError(e.message) }
    setBusy(false)
  }
  return (
    <div className="grid gap-4 rounded-2xl border bg-muted/50 p-4 text-sm sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Zone</Label>
        <Select value={zone} onValueChange={(v) => pick(v, severity)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{data.repair_zones.map((z) => <SelectItem key={z.zone} value={z.zone}>{z.label || z.zone}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Gravité</Label>
        <Select value={severity} onValueChange={(v) => pick(zone, v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SEVERITIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`fee-${s.id}`}>Forfait retenu (€, plafonné à la caution restante)</Label>
        <Input id={`fee-${s.id}`} inputMode="decimal" value={euros} onChange={(e) => setEuros(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`desc-${s.id}`}>Constat</Label>
        <Input id={`desc-${s.id}`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ex. éclat de 2 cm sur le rail gauche" />
      </div>
      <label className="flex items-center gap-2"><Checkbox checked={workshop} onCheckedChange={(v) => setWorkshop(Boolean(v))} /> envoyer la planche à l'atelier</label>
      <div className="sm:col-span-2"><ErrorNote error={error} /></div>
      <Button variant="destructive" className="sm:col-span-2 sm:justify-self-start" disabled={busy} onClick={submit}>
        {busy && <Loader2 className="animate-spin" />} Retenir <Money cents={cents} /> et libérer le reste
      </Button>
    </div>
  )
}

function DoneRow({ session: s }) {
  const charged = s.damage_reports.filter((d) => d.charged)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span><span className="font-mono font-extrabold">{s.board_id}</span> · {s.duration_label} · payé <Money cents={s.charged_cents} /></span>
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="ocean">caution {s.deposit_label}</Badge>
        {charged.map((d) => <Badge key={d.id} variant="coral">{d.zone} <Money cents={d.fee_cents} /></Badge>)}
        {s.checked_role && <span className="text-xs text-muted-foreground">par rôle {s.checked_role}</span>}
      </span>
    </div>
  )
}
