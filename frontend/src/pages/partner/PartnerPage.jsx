import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Clock, Eye, Loader2, Plus, Sparkles, Ticket, Timer, Users, Waves as WavesIcon } from 'lucide-react'
import { api } from '@/api.js'
import { PinGate, Waves } from '@/components/Layout.jsx'
import { ErrorNote, Logo, Money, Spinner, Stat, TxLink, fileToBase64, usePoll } from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

// Partner dashboard: aggregated figures and proofs, never a name.
export default function PartnerPage() {
  const { id } = useParams()
  const { data, error, reload } = usePoll(() => api.partnerDashboard(id), 3000, [id])

  if (error && error.status === 401) return <PinGate onSaved={reload} />
  if (error && !data) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-10">
        <Logo className="h-16" />
        <ErrorNote error={error.status === 404 ? 'Partenaire inconnu.' : error.message} />
      </main>
    )
  }
  if (!data) return <Spinner className="min-h-dvh" />

  const bought = data.hours_bought * 60
  const pct = bought ? Math.min(100, Math.round((data.minutes_used / bought) * 100)) : 0
  return (
    <div className="min-h-dvh pb-12">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-4xl px-4 pt-4">
          <Link to="/" aria-label="Grab&Surf"><Logo className="h-12" /></Link>
          <div className="mt-6 text-xs font-bold uppercase tracking-widest text-lagoon">Espace partenaire</div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{data.partner.name}</h1>
          <p className="mt-2 max-w-2xl text-white/70">{data.statement}</p>
        </div>
        <Waves className="mt-4" />
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat tone="navy" icon={Clock} label="Heures achetées" value={data.hours_bought} />
          <Stat icon={Timer} label="Minutes surfées" value={data.minutes_used} />
          <Stat icon={WavesIcon} label="Sessions" value={data.sessions_count} />
          <Stat icon={Users} label="Personnes" value={data.people_count} />
        </div>

        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold">Utilisation du pack</span>
              <span className="text-2xl font-extrabold">{pct} %</span>
            </div>
            <Progress value={pct} className="h-3 bg-foam [&>div]:bg-sun" />
            <p className="text-xs text-muted-foreground">Montant du pack : <Money cents={data.amount_cents} /> · registre : {data.chain.label}</p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><Ticket className="h-5 w-5 text-ocean" /> Codes distribués</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Code</TableHead><TableHead>Quota</TableHead><TableHead className="text-right">Utilisé</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {data.codes.map((c) => (
                    <TableRow key={c.code}>
                      <TableCell className="font-mono font-bold">{c.code}</TableCell>
                      <TableCell>{c.minutes_quota} min</TableCell>
                      <TableCell className="text-right">{c.minutes_used} min</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-xl">Sessions et preuves</CardTitle></CardHeader>
            <CardContent>
              {!data.sessions.length && <p className="text-sm text-muted-foreground">Aucune session pour l'instant. Les codes attendent leurs surfeurs.</p>}
              <ul className="space-y-2">
                {data.sessions.map((s) => (
                  <li key={s.rental_id} className="rounded-xl bg-muted p-3 text-sm">
                    <div className="flex justify-between gap-2">
                      <span><span className="font-mono font-bold">{s.board_id}</span> · code {s.code}</span>
                      <Badge variant="sun">{s.pack_minutes} min offertes</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {s.proofs.map((p, i) => (
                        <span key={i} className="flex items-center gap-1 text-xs"><Badge variant="muted">{p.event_type}</Badge> <TxLink hash={p.tx_hash} url={p.url} /></span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Sponsoring partnerId={id} />
      </main>
    </div>
  )
}

const SP_STATUS = { pending: ['En attente du propriétaire', 'sun'], active: ['Actif', 'ocean'], rejected: ['Refusé', 'coral'], ended: ['Terminé', 'muted'] }
const NO_QUOTES = (v) => v.replace(/["\\]/g, '')

// Sponsor a board: the design of a local artist becomes the NFT image, names go on-chain.
function Sponsoring({ partnerId }) {
  const list = usePoll(() => api.partnerSponsorships(partnerId), 5000, [partnerId])
  const boards = usePoll(() => api.qrCodes(), 60000, [])
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-xl"><Sparkles className="h-5 w-5 text-sun" /> Parrainer une planche</CardTitle>
          {!open && <Button variant="sun" onClick={() => setOpen(true)}><Plus /> Nouveau parrainage</Button>}
        </div>
        <CardDescription>
          Offrez à une planche le design d'un artiste local. Après validation du propriétaire, le design devient l'image du NFT
          et le passeport public met en avant l'artiste et votre marque. Seuls les noms publics, le lien du design, son empreinte
          et les dates sont inscrits sur la chaîne.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {open && (
          <SponsorForm partnerId={partnerId} boards={boards.data?.boards || []}
            onDone={() => { setOpen(false); list.reload() }} onCancel={() => setOpen(false)} />
        )}
        <ul className="space-y-2">
          {(list.data || []).map((sp) => <SponsorRow key={sp.id} sp={sp} />)}
        </ul>
        {list.data && !list.data.length && !open && <p className="text-sm text-muted-foreground">Aucun parrainage pour l'instant.</p>}
      </CardContent>
    </Card>
  )
}

export function SponsorRow({ sp, children }) {
  const [label, variant] = SP_STATUS[sp.status] || [sp.status, 'muted']
  return (
    <li className="flex gap-4 rounded-2xl border bg-card p-3 text-sm">
      {sp.design_url && <img src={sp.design_url} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-muted object-cover" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/p/${sp.board_id}`} className="font-mono font-extrabold hover:underline">{sp.board_id}</Link>
          <Badge variant={variant}>{label}</Badge>
        </div>
        <div className="font-bold">{sp.sponsor_name} <span className="font-normal text-muted-foreground">· design {sp.artist_name}</span></div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>du {sp.start_date}{sp.end_date ? ` au ${sp.end_date}` : ''}</span>
          <span>{sp.media.length} média(s)</span>
          {sp.stats && (
            <>
              <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {sp.stats.passport_views} vue(s)</span>
              <span>{sp.stats.sessions} session(s)</span>
              <span>{sp.stats.minutes_surfed} min surfées</span>
            </>
          )}
        </div>
        {sp.chain?.status && <div className="mt-1 flex items-center gap-2 text-xs"><Badge variant="muted">SPONSORING</Badge> <TxLink hash={sp.chain.tx_hash} url={sp.chain.url} /></div>}
        {children}
      </div>
    </li>
  )
}

function Field({ id, label, className = '', children }) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
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
  const boardId = f.board_id || boards[0]?.id || ''
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const media = [
        ...(await Promise.all(images.map(async (file) => ({ kind: 'image', image_base64: await fileToBase64(file), caption: file.name.replace(/\.[^.]+$/, '').slice(0, 160) })))),
        ...videos.split('\n').map((v) => v.trim()).filter(Boolean).map((url) => ({ kind: 'video', url })),
      ]
      await api.submitSponsorship(partnerId, { ...f, board_id: boardId, design_base64: await fileToBase64(design), media })
      onDone()
    } catch (x) { setErr(x.message) }
    setBusy(false)
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border bg-muted/40 p-4 sm:grid-cols-2">
      <Field id="sp-board" label="Planche">
        <Select value={boardId} onValueChange={(v) => setF({ ...f, board_id: v })}>
          <SelectTrigger id="sp-board"><SelectValue placeholder="Choisir une planche" /></SelectTrigger>
          <SelectContent>{boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.id} (base {b.home_station})</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field id="sp-sponsor" label="Nom public du sponsor (sur la chaîne)">
        <Input id="sp-sponsor" required minLength={2} maxLength={80} value={f.sponsor_name} onChange={set('sponsor_name', NO_QUOTES)} />
      </Field>
      <Field id="sp-artist" label="Nom public de l'artiste (sur la chaîne)">
        <Input id="sp-artist" required minLength={2} maxLength={80} value={f.artist_name} onChange={set('artist_name', NO_QUOTES)} />
      </Field>
      <Field id="sp-url" label="Lien du sponsor">
        <Input id="sp-url" type="url" placeholder="https://" maxLength={200} value={f.sponsor_url} onChange={set('sponsor_url')} />
      </Field>
      <Field id="sp-bio" label="Présentation de l'artiste" className="sm:col-span-2">
        <Textarea id="sp-bio" rows={2} maxLength={400} value={f.artist_bio} onChange={set('artist_bio')} />
      </Field>
      <Field id="sp-msg" label="Message du sponsor sur le passeport" className="sm:col-span-2">
        <Input id="sp-msg" maxLength={280} value={f.message} onChange={set('message')} />
      </Field>
      <Field id="sp-start" label="Début">
        <Input id="sp-start" type="date" required value={f.start_date} onChange={set('start_date')} />
      </Field>
      <Field id="sp-end" label="Fin (facultatif)">
        <Input id="sp-end" type="date" min={f.start_date} value={f.end_date} onChange={set('end_date')} />
      </Field>
      <Field id="sp-design" label="Design de la planche (image, 4 Mo max)">
        <Input id="sp-design" className="pt-2.5" type="file" accept="image/*" required onChange={(e) => setDesign(e.target.files?.[0] || null)} />
      </Field>
      <Field id="sp-gallery" label="Photos de l'artiste et de son travail">
        <Input id="sp-gallery" className="pt-2.5" type="file" accept="image/*" multiple onChange={(e) => setImages(Array.from(e.target.files || []).slice(0, 6))} />
      </Field>
      <Field id="sp-videos" label="Vidéos (liens https, un par ligne)" className="sm:col-span-2">
        <Textarea id="sp-videos" className="font-mono text-xs" rows={2} value={videos} onChange={(e) => setVideos(e.target.value)} />
      </Field>
      <div className="sm:col-span-2"><ErrorNote error={err} /></div>
      <div className="flex gap-2 sm:col-span-2">
        <Button disabled={busy || !design}>{busy && <Loader2 className="animate-spin" />} Envoyer au propriétaire</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  )
}
