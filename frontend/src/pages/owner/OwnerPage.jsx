import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { AlertTriangle, Check, Loader2, Printer } from 'lucide-react'
import { api } from '@/api.js'
import { PageTitle, PinGate, StaffLayout, useRole } from '@/components/Layout.jsx'
import { ConfirmDialog, ErrorNote, Money, Spinner, usePoll } from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SponsorRow } from '../partner/PartnerPage.jsx'

const URL_KEY = 'gs_qr_base_url'

// Owner (Notox): QR codes to print for racks and boards, the repair price grid, the sponsorships to review.
export default function OwnerPage() {
  const [role, setRole] = useRole()
  return (
    <StaffLayout role={role} setRole={setRole}>
      <PageTitle kicker="Propriétaire" title="Le parc Notox" />
      <Tabs defaultValue="qr" className="space-y-6">
        <TabsList className="print:hidden">
          <TabsTrigger value="qr">QR à imprimer</TabsTrigger>
          <TabsTrigger value="fees">Forfaits</TabsTrigger>
          <TabsTrigger value="sponsoring">Parrainages</TabsTrigger>
        </TabsList>
        <TabsContent value="qr" className="space-y-6"><QrSheet /></TabsContent>
        <TabsContent value="fees"><RepairFees /></TabsContent>
        <TabsContent value="sponsoring"><SponsorReview role={role} /></TabsContent>
      </Tabs>
    </StaffLayout>
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
        <CardContent className="space-y-3 pt-5">
          <Label htmlFor="base">Adresse du site encodée dans les QR</Label>
          <div className="flex flex-wrap gap-2">
            <Input id="base" className="max-w-md font-mono" value={base} onChange={(e) => saveBase(e.target.value)} />
            <Button className="h-11" onClick={() => window.print()}><Printer /> Imprimer la planche de QR</Button>
          </div>
          {localhost && (
            <p className="flex items-start gap-2 rounded-xl bg-coral-50 p-3 text-sm text-coral">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              « localhost » ne marche pas depuis un téléphone : mets l'adresse de cet ordinateur sur le Wi-Fi
              (par exemple http://192.168.8.20:9000) ou l'adresse publique du site.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            QR du rack : ouvre la location. QR de planche (gravé au laser) : passeport, retour de secours, photo et casse.
            La caméra du navigateur demande HTTPS (ou localhost) ; sinon le client prend le QR en photo.
          </p>
        </CardContent>
      </Card>
      <section>
        <h2 className="mb-3 text-xl font-extrabold print:mt-0">Racks</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
          {data.racks.map((r) => (
            <QrCard key={r.id} url={clean + r.path} title="Louer une planche" subtitle={r.label} note="Scanne · Scan · Escanea" big />
          ))}
        </div>
      </section>
      <section className="print:break-before-page">
        <h2 className="mb-3 text-xl font-extrabold">Planches</h2>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6 print:grid-cols-6">
          {data.boards.map((b) => <QrCard key={b.id} url={clean + b.path} title={b.label} subtitle={`base ${b.home_station}`} />)}
        </div>
      </section>
    </>
  )
}

function QrCard({ url, title, subtitle, note, big = false }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: big ? 480 : 240, errorCorrectionLevel: 'M',
      color: { dark: '#0B2533', light: '#FFFFFF' } }).then(setSrc).catch(() => setSrc(null))
  }, [url, big])
  return (
    <div className="break-inside-avoid overflow-hidden rounded-2xl border bg-white text-center shadow-soft">
      {big && <div className="bg-navy px-3 py-2 text-lg font-extrabold text-white">{title}</div>}
      <div className="p-3">
        {src ? <img src={src} alt={url} className="mx-auto w-full max-w-[220px]" /> : <div className="aspect-square" />}
        {!big && <div className="font-mono text-sm font-extrabold">{title}</div>}
        <div className="text-xs text-muted-foreground">{subtitle}</div>
        {note && <div className="mt-1 font-script text-lg text-cork-700">{note}</div>}
        <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground/70">{url}</div>
      </div>
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
      <CardHeader>
        <CardTitle className="text-xl">Forfaits de réparation</CardTitle>
        <CardDescription>
          Prix de base par zone, pour une casse moyenne. L'IA et l'exploitant s'en servent pour proposer le forfait,
          ajusté selon la gravité : légère {pct.minor} %, moyenne {pct.moderate} %, grave {pct.severe} %.
          Le montant n'est retenu sur la caution qu'après validation par l'exploitant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead><TableHead>Libellé</TableHead><TableHead>Moyenne (€)</TableHead>
              <TableHead>Légère</TableHead><TableHead>Grave</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const cents = Math.round(parseFloat(String(r.euros).replace(',', '.')) * 100) || 0
              return (
                <TableRow key={r.zone}>
                  <TableCell className="font-mono font-bold">{r.zone}</TableCell>
                  <TableCell><Input className="h-9 min-w-[140px]" value={r.label} onChange={(e) => update(i, 'label', e.target.value)} /></TableCell>
                  <TableCell><Input className="h-9 w-28" inputMode="decimal" value={r.euros} onChange={(e) => update(i, 'euros', e.target.value)} /></TableCell>
                  <TableCell className="text-muted-foreground"><Money cents={Math.floor(cents * pct.minor / 100)} /></TableCell>
                  <TableCell className="text-muted-foreground"><Money cents={Math.floor(cents * pct.severe / 100)} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <ErrorNote error={err} />
        <div className="flex items-center gap-3">
          <Button disabled={busy} onClick={save}>{busy && <Loader2 className="animate-spin" />} Enregistrer la grille</Button>
          {msg && <span className="flex items-center gap-1 text-sm font-bold text-ocean-700"><Check className="h-4 w-4" /> {msg}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

// The owner approves a sponsorship before the design and the public names go on-chain.
function SponsorReview({ role }) {
  const { data, error, reload } = usePoll(() => api.sponsorships(), 4000, [])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const [ending, setEnding] = useState(null)
  if (error && error.status === 401) return <PinGate onSaved={reload} />
  if (error) return <ErrorNote error={error.message} />
  if (!data) return <Spinner />
  const act = async (id, fn) => {
    setBusy(id); setErr(null)
    try { await fn(); await reload() } catch (e) { setErr(e.message) }
    setBusy(null)
  }
  const groups = [['pending', 'À valider'], ['active', 'Actifs'], ['ended', 'Terminés ou refusés']]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Parrainages</CardTitle>
        <CardDescription>
          Valider inscrit sur la chaîne le nom public du sponsor et de l'artiste, l'empreinte et le lien du design, et les dates.
          Le design devient l'image du NFT. Un nouveau parrainage termine le précédent sur la même planche.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ErrorNote error={err} />
        {groups.map(([key, label]) => {
          const rows = data.filter((sp) => (key === 'ended' ? ['ended', 'rejected'].includes(sp.status) : sp.status === key))
          if (!rows.length) return null
          return (
            <section key={key} className="space-y-2">
              <h3 className="flex items-center gap-2 font-extrabold">{label} <Badge variant="muted">{rows.length}</Badge></h3>
              <ul className="space-y-2">
                {rows.map((sp) => (
                  <SponsorRow key={sp.id} sp={sp}>
                    {sp.status === 'pending' && (
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" disabled={busy === sp.id}
                          onClick={() => act(sp.id, () => api.reviewSponsorship(sp.id, 'approve', role))}>
                          {busy === sp.id && <Loader2 className="animate-spin" />} Valider
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => act(sp.id, () => api.reviewSponsorship(sp.id, 'reject', role))}>Refuser</Button>
                      </div>
                    )}
                    {sp.status === 'active' && (
                      <Button size="sm" variant="outline" className="mt-3" onClick={() => setEnding(sp)}>Terminer</Button>
                    )}
                  </SponsorRow>
                ))}
              </ul>
            </section>
          )
        })}
        {!data.length && <p className="text-sm text-muted-foreground">Aucune demande de parrainage.</p>}
      </CardContent>
      <ConfirmDialog open={Boolean(ending)} onOpenChange={(o) => !o && setEnding(null)}
        title={`Terminer le parrainage de ${ending?.board_id || ''} ?`} confirmLabel="Terminer"
        onConfirm={() => act(ending.id, () => api.endSponsorship(ending.id))} />
    </Card>
  )
}
