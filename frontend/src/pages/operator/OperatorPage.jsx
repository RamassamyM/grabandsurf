import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Bell, BellOff, Camera, CheckCircle2, Clock, Coins, HelpCircle, Link2, RadioTower, RotateCcw,
  ShieldAlert, Siren, Waves, Wrench,
} from 'lucide-react'
import { api } from '@/api.js'
import { PageTitle, PinGate, StaffLayout, useRole } from '@/components/Layout.jsx'
import {
  ConfirmDialog, ErrorNote, Money, Spinner, Stat, StatusBadge, TxLink, formatDuration, usePoll,
} from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const ALERT_ICONS = { theft: Siren, not_returned: Clock, station_offline: RadioTower, damage: Wrench, unknown_board: HelpCircle }

// Operator dashboard: one page, refreshed every 2 seconds.
export default function OperatorPage() {
  const { data, error, reload } = usePoll(() => api.fleet(), 2000, [])
  const photos = usePoll(() => api.photos(), 4000, [])
  const [role, setRole] = useRole()
  const [sound, setSound] = useState(false)
  useAlarmBeep(data, sound)

  if (error && error.status === 401) return <PinGate onSaved={reload} />
  const boards = data?.boards || []
  const count = (...statuses) => boards.filter((b) => statuses.includes(b.status)).length
  return (
    <StaffLayout role={role} setRole={setRole} actions={(
      <>
        <label className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-bold">
          {sound ? <Bell className="h-4 w-4 text-sun" /> : <BellOff className="h-4 w-4 text-white/60" />}
          <span className="hidden md:inline">Son</span>
          <Switch checked={sound} onCheckedChange={setSound} aria-label="Activer le son des alarmes" />
        </label>
        {data && <span className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-xs text-white/70">t = {Math.round(data.now_t)} s</span>}
      </>
    )}>
      <PageTitle kicker="Exploitant" title="Tableau de bord" />
      {error && <ErrorNote error={error.message} />}
      {!data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat tone="navy" icon={Coins} label="Chiffre d'affaires" value={<Money cents={data.revenue_cents} />} />
            <Stat icon={CheckCircle2} label="Au rack" value={`${count('at_rack', 'away_from_home')} / ${boards.length}`} />
            <Stat icon={Waves} label="En mer" value={count('at_sea', 'not_returned', 'unauthorized')} />
            <Stat tone={data.alerts.length ? 'sun' : 'default'} icon={AlertTriangle} label="Alertes" value={data.alerts.length} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Missions missions={data.missions} />
            <Stations stations={data.stations} />
          </div>

          {data.deposits_to_check > 0 && (
            <Link to="/operator/inspection" className="group flex items-center justify-between gap-4 rounded-2xl border-2 border-sun bg-sun/10 p-4 transition hover:bg-sun/20">
              <div>
                <div className="font-extrabold">{data.deposits_to_check} caution(s) à vérifier</div>
                <div className="text-sm text-muted-foreground">Valider l'état des planches rendues ou retenir un forfait de réparation.</div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
            </Link>
          )}

          <Alerts alerts={data.alerts} reload={reload} />
          <Boards boards={boards} role={role} reload={reload} />
          <DamageReports reports={data.damage_reports} role={role} reload={reload} />
          <ReturnPhotos photos={photos.data || []} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Rentals rentals={data.rentals} />
            <Chain chain={data.chain} />
          </div>
          <ResetDemo reload={reload} />
        </>
      )}
    </StaffLayout>
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
    <div className="rounded-2xl bg-navy p-5 text-white shadow-soft lg:col-span-2">
      <div className="text-xs font-bold uppercase tracking-widest text-lagoon">Missions du jour</div>
      <ol className="mt-4 space-y-3">
        {missions.map((m, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sun text-sm font-extrabold text-navy">{i + 1}</span>
            <span className="text-lg leading-snug">{m}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Stations({ stations }) {
  return (
    <Card>
      <CardHeader><CardTitle>Stations</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {stations.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
            <span><span className="font-extrabold">{s.id}</span> · {s.name}</span>
            <span className={cn('flex items-center gap-1.5 text-xs font-bold',
              s.online ? 'text-ocean-700' : s.online === false ? 'text-coral' : 'text-muted-foreground')}>
              <span className={cn('h-2 w-2 rounded-full', s.online ? 'bg-ocean' : s.online === false ? 'bg-coral' : 'bg-muted-foreground/40')} />
              {s.online ? 'en ligne' : s.online === false ? 'hors ligne' : 'jamais vue'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function Alerts({ alerts, reload }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 text-muted-foreground shadow-soft">
        <CheckCircle2 className="h-5 w-5 text-ocean" /> Aucune alerte. Tout va bien sur la plage.
      </div>
    )
  }
  return (
    <Card className="border-coral/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-coral" /> Alertes <Badge variant="coral">{alerts.length}</Badge></CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {alerts.map((a) => {
            const Icon = ALERT_ICONS[a.kind] || AlertTriangle
            return (
              <li key={a.id} className={cn('flex items-center justify-between gap-3 py-2.5', a.kind === 'theft' && 'font-bold text-coral')}>
                <span className="flex items-center gap-3"><Icon className="h-4 w-4 shrink-0" /> {a.message}</span>
                <Button variant="outline" size="sm" onClick={async () => { await api.resolveAlert(a.id); reload() }}>Traitée</Button>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function Boards({ boards, role, reload }) {
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null)  // { kind: 'loss' | 'correction', board }
  const act = async (fn) => { setError(null); try { await fn(); await reload() } catch (e) { setError(e.message) } }
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Planches</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ErrorNote error={error} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <div key={b.id} className="rounded-2xl border p-4 transition hover:border-ocean/40">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/p/${b.id}`} className="font-mono font-extrabold hover:underline">{b.id}</Link>
                <StatusBadge status={b.status} label={b.status_label} />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                base {b.home_station}{b.current_station && b.current_station !== b.home_station ? ` · à ${b.current_station}` : ''}
                {' · '}{b.rentals_count} sortie(s) · depuis {b.since_label}
              </div>
              {b.needs_review && <Badge variant="sun" className="mt-2">casse à vérifier</Badge>}
              {b.rental && <div className="mt-2 text-sm font-bold">{b.rental.customer} · {formatDuration(b.rental.duration_s)}</div>}
              <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
                {['not_returned', 'unauthorized'].includes(b.status) && (
                  <Button variant="destructive" size="sm" onClick={() => setDialog({ kind: 'loss', board: b.id })}>Confirmer la perte</Button>
                )}
                {b.status === 'unauthorized' && (
                  <Button variant="outline" size="sm" onClick={() => setDialog({ kind: 'correction', board: b.id })}>Corriger (faux départ)</Button>
                )}
                {['workshop', 'lost', 'sold'].includes(b.status) && (
                  <Button variant="outline" size="sm" onClick={() => act(() => api.backInService(b.id, role))}>
                    <RotateCcw /> Remettre en service
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <ConfirmDialog open={dialog?.kind === 'loss'} onOpenChange={(o) => !o && setDialog(null)} destructive
        title={`Confirmer la perte de ${dialog?.board || ''} ?`}
        description="À faire seulement après avoir vérifié le rack. La perte est inscrite dans le carnet de vie de la planche."
        confirmLabel="Confirmer la perte" onConfirm={() => act(() => api.confirmLoss(dialog.board, role))} />
      <ConfirmDialog open={dialog?.kind === 'correction'} onOpenChange={(o) => !o && setDialog(null)}
        title={`Faux départ de ${dialog?.board || ''}`}
        description="La planche est bien au rack ? Le motif est inscrit sur la chaîne, sans aucun nom."
        input={{ label: 'Motif', initial: 'Faux départ, planche vue au rack' }} confirmLabel="Corriger"
        onConfirm={(reason) => act(() => api.correctDeparture(dialog.board, role, reason.replace(/["\\]/g, '')))} />
    </Card>
  )
}

const SEVERITY = { minor: 'légère', moderate: 'moyenne', severe: 'grave' }
const SOURCE = { photo_ai: 'IA photo', customer: 'client', inspection: 'inspection' }

function DamageReports({ reports, role, reload }) {
  if (!reports.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Casses à valider</CardTitle>
        <CardDescription>L'IA propose, l'exploitant décide. Seul le rôle du validateur est enregistré.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {reports.map((d) => <DamageReview key={d.id} report={d} role={role} reload={reload} />)}
        </ul>
      </CardContent>
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
    <li className="flex flex-wrap items-start gap-4 rounded-2xl bg-muted p-4">
      {d.photo_id && <img src={api.photoImageUrl(d.photo_id)} alt="" className="h-20 w-20 rounded-xl object-cover" />}
      <div className="min-w-[220px] flex-1 space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-mono">{d.board_id}</strong>
          <Badge variant="outline">zone {d.zone}</Badge>
          <Badge variant={d.severity === 'severe' ? 'coral' : 'sun'}>{SEVERITY[d.severity] || d.severity}</Badge>
          <span className="text-xs text-muted-foreground">source {SOURCE[d.source] || d.source}</span>
        </div>
        {d.description && <div className="text-muted-foreground">{d.description}</div>}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 font-bold">Forfait
            <Input className="h-9 w-24" inputMode="decimal" value={euros} onChange={(e) => setEuros(e.target.value)} /> €
          </label>
          {d.rental_id && (
            <label className="flex items-center gap-2"><Checkbox checked={charge} onCheckedChange={(v) => setCharge(Boolean(v))} /> retenir sur la caution</label>
          )}
          <label className="flex items-center gap-2"><Checkbox checked={workshop} onCheckedChange={(v) => setWorkshop(Boolean(v))} /> envoyer à l'atelier</label>
        </div>
        <ErrorNote error={error} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => review('confirm')}>Valider la casse</Button>
        <Button size="sm" variant="outline" onClick={() => review('reject')}>Refuser</Button>
      </div>
    </li>
  )
}

const CONDITION = { good: 'bon état', worn: 'usée', damaged: 'abîmée', unclear: 'photo peu claire' }

export function PhotoDiagnosis({ photo, compact = false }) {
  const ai = photo.ai_result || {}
  const s = photo.suggestion || { actions: [] }
  return (
    <div className="flex flex-wrap gap-4 rounded-2xl bg-muted p-4 text-sm">
      {photo.has_image
        ? <a href={api.photoImageUrl(photo.id)} target="_blank" rel="noreferrer"><img src={api.photoImageUrl(photo.id)} alt="" className={cn(compact ? 'h-20 w-20' : 'h-28 w-28', 'rounded-xl object-cover')} /></a>
        : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-background text-muted-foreground"><Camera className="h-6 w-6" /></div>}
      <div className="min-w-[220px] flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="font-mono">{photo.board_id}</strong>
          <Badge variant={ai.engine === 'claude' ? 'navy' : 'muted'}>{ai.engine === 'claude' ? 'IA Claude' : 'simulation'}</Badge>
          <span className="text-xs text-muted-foreground">
            QR {ai.board_read || 'non lu'} · {CONDITION[ai.overall_condition] || ai.overall_condition} · confiance {Math.round((ai.confidence || 0) * 100)} %
          </span>
          {photo.rewarded && <Badge variant="ocean">+1 € crédité</Badge>}
        </div>
        {ai.summary && <p className="text-muted-foreground">{ai.summary}</p>}
        <p className="font-bold">{s.sentence}</p>
        {s.actions.length > 0 && (
          <ul className="list-disc pl-5">
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
      <CardHeader>
        <CardTitle className="text-xl">Photos de retour et diagnostics</CardTitle>
        <CardDescription>Suggestions de réparation calculées avec la grille du propriétaire. Rien n'est retenu sans validation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{photos.slice(0, 6).map((p) => <PhotoDiagnosis key={p.id} photo={p} />)}</CardContent>
    </Card>
  )
}

function Rentals({ rentals }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Locations terminées</CardTitle></CardHeader>
      <CardContent>
        {!rentals.length && <p className="text-sm text-muted-foreground">Aucune location terminée pour l'instant.</p>}
        <Table>
          <TableBody>
            {rentals.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono font-bold">{r.board_id}</TableCell>
                <TableCell>{formatDuration(r.duration_s)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.status === 'bought' ? 'achat implicite' : r.return_mode === 'manual' ? 'retour QR' : 'retour détecté'}
                </TableCell>
                <TableCell className="text-right font-bold"><Money cents={r.charged_cents} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Chain({ chain }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-xl"><Link2 className="h-5 w-5 text-ocean" /> Blockchain</CardTitle>
          <Badge variant={chain.mode === 'real' ? 'ocean' : 'muted'}>{chain.label}</Badge>
        </div>
        {chain.contract_url
          ? <a href={chain.contract_url} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-ocean-700 hover:underline">{chain.contract}</a>
          : <CardDescription>{chain.reason}</CardDescription>}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">En attente d'écriture : {chain.pending}{chain.error ? ` · réseau : ${chain.error} (on réessaie)` : ''}</p>
        <ul className="mt-3 divide-y text-sm">
          {chain.txs.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2">
              <span><span className="font-mono font-bold">{t.board_id}</span> <Badge variant="muted" className="ml-1">{t.event_type}</Badge> {t.station || '-'}</span>
              <TxLink hash={t.tx_hash} url={t.url} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ResetDemo({ reload }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex justify-end pb-8">
      <Button variant="outline" onClick={() => setOpen(true)}><RotateCcw /> Remettre la démo à zéro</Button>
      <ConfirmDialog open={open} onOpenChange={setOpen} title="Remettre la démo à zéro ?"
        description="Les planches reviennent au rack. Le registre blockchain, lui, garde tout." confirmLabel="Remettre à zéro"
        onConfirm={async () => { await api.resetDemo(); await reload() }} />
    </div>
  )
}
