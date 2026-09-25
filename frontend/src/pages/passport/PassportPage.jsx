import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  AlertTriangle, BadgeCheck, ExternalLink, Fingerprint, Loader2, Play, QrCode, Share2, Sparkles, Undo2,
} from 'lucide-react'
import { api, session } from '@/api.js'
import QrScanner from '@/components/QrScanner.jsx'
import { CustomerHeader } from '@/components/Layout.jsx'
import { ErrorNote, IconBubble, Spinner, StatusBadge, TxLink, usePoll } from '@/components/common.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useT } from '@/i18n.jsx'
import { cn } from '@/lib/utils'
import { PhotoReturn } from '../client/StationPage.jsx'

const ZONES = ['nose', 'tail', 'rail', 'fin', 'deck']

// Public passport opened by the QR engraved on the board.
export default function PassportPage() {
  const { t } = useT()
  const { board } = useParams()
  const { data, error } = usePoll(() => api.passport(board), 4000, [board])
  const me = usePoll(() => (session.token() ? api.me() : Promise.resolve(null)), 4000, [board])
  const counted = useRef(null)
  useEffect(() => {
    if (counted.current === board) return
    counted.current = board
    api.countView(board).catch(() => { /* the counter never blocks the page */ })
  }, [board])

  if (error && !data) {
    return (
      <div className="min-h-dvh">
        <CustomerHeader><h1 className="text-3xl font-extrabold">{t('passport')}</h1></CustomerHeader>
        <main className="mx-auto max-w-md px-4"><ErrorNote error={error.status === 404 ? t('unknown_board') : error.message} /></main>
      </div>
    )
  }
  if (!data) return <Spinner label={t('loading')} className="min-h-dvh" />

  const b = data.board
  const mine = me.data?.current_rental?.board_id === b.id ? me.data.current_rental : null
  const lastMine = me.data?.history?.find((r) => r.board_id === b.id)

  return (
    <div className="min-h-dvh pb-16">
      <CustomerHeader>
        <div className="text-xs font-bold uppercase tracking-widest text-lagoon">{t('passport')}</div>
        <h1 className="mt-1 font-script text-6xl leading-tight text-sun">{b.id}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={b.status} label={t(`status_${b.status}`)} />
          <span className="text-white/70">{t('material')} · {t('base', { id: b.home_station })} · {t('nft', { id: b.token_id })}</span>
        </div>
      </CustomerHeader>

      <main className="mx-auto max-w-md space-y-4 px-4">
        <div className="grid grid-cols-3 gap-3">
          <MiniStat value={data.sessions} label={t('sessions')} />
          <MiniStat value={data.minutes_surfed} label={t('minutes_surfed')} />
          <MiniStat value={data.repairs} label={t('repairs')} />
        </div>

        {mine && mine.status !== 'armed' && <ReturnHere rental={mine} board={b.id} reload={me.reload} />}
        {!mine && lastMine && lastMine.status === 'returned' && !lastMine.photo_taken && (
          <Card><CardContent className="pt-1"><PhotoReturn rental={lastMine} reload={me.reload} /></CardContent></Card>
        )}

        {data.sponsorship && <SponsorCard sp={data.sponsorship} />}

        {data.ambassador && (
          <div className="rounded-3xl bg-navy p-5 text-white shadow-soft">
            <div className="text-xs font-bold uppercase tracking-widest text-lagoon">{t('ambassador')}</div>
            <div className="mt-1 text-2xl font-extrabold">{data.ambassador.name}</div>
            <div className="text-sm text-white/70">{data.ambassador.tagline}</div>
            <p className="mt-3 font-script text-xl leading-snug text-sun">« {data.ambassador.story} »</p>
            <p className="mt-2 text-xs text-white/50">{t('fictional')}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xl">{t('life_log')}</CardTitle>
              <Badge variant="muted">{data.chain.label}</Badge>
            </div>
            <CardDescription>{t('life_log_text')}</CardDescription>
          </CardHeader>
          <CardContent>
            <SyncLine sync={data.sync} />
            {data.history.length === 0 && <p className="mt-4 text-sm text-muted-foreground">{t('life_log_empty')}</p>}
            <ol className="relative mt-5 space-y-5 border-l-2 border-foam-200 pl-5">
              {data.history.map((h, i) => <HistoryRow key={`${h.tx_hash || 'p'}-${h.event_type}-${i}`} h={h} />)}
            </ol>
            {data.chain.contract_url && (
              <a className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-ocean-700 hover:underline"
                href={data.chain.contract_url} target="_blank" rel="noreferrer">
                {t('see_registry')} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </CardContent>
        </Card>

        <PhotoCheck history={data.history} />
        <ShareButton board={b.id} />
        <DamageCard board={b.id} />
      </main>
    </div>
  )
}

function MiniStat({ value, label }) {
  return (
    <div className="rounded-2xl border bg-card p-3 text-center shadow-soft">
      <div className="text-3xl font-extrabold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

const STATUS_VARIANTS = {
  verified: 'ocean',
  pending: 'muted',
  reading: 'muted',
  simulation: 'muted',
  skipped: 'sun',
  rejected: 'coral',
  missing: 'coral',
}

function HistoryRow({ h }) {
  const { t } = useT()
  const d = h.details || {}
  const dot = h.status === 'verified' ? 'bg-ocean' : h.event_type === 'CORRECTION' ? 'bg-coral' : 'bg-sun'
  const short = (x) => (x ? `${x.slice(0, 10)}…${x.slice(-6)}` : '')
  return (
    <li className="relative">
      <span className={cn('absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-[3px] border-white', dot)} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold">{t(`ev_${h.event_type}`)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{t('station_t', { station: h.station || '-', t: Math.round(h.t) })}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANTS[h.status] || 'muted'} className="gap-1 text-[11px]">
          {h.status === 'verified' && <BadgeCheck className="h-3 w-3" />}{t(`st_${h.status}`)}
        </Badge>
        {h.tx_hash && <TxLink hash={h.tx_hash} url={h.url} />}
      </div>
      {(d.duration_label || d.offered_by) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {[d.duration_label && t('session_of', { duration: d.duration_label }), d.offered_by && t('offered_by', { partner: d.offered_by })]
            .filter(Boolean).join(' · ')}
        </div>
      )}
      {d.photo_sha256 && (
        <div className="mt-1 text-xs text-muted-foreground">
          {t('photo_print')} <span className="font-mono">{short(d.photo_sha256)}</span>
          {d.signer && <> · {t('signed_by', { signer: short(d.signer) })}</>}
        </div>
      )}
      {h.event_type === 'CORRECTION' && (
        <div className="mt-1 text-xs text-muted-foreground">
          {d.corrected_index !== undefined && d.corrected_index !== null && <>{t('correction_of', { index: d.corrected_index })} · </>}
          {d.reason}
        </div>
      )}
    </li>
  )
}

function SyncLine({ sync }) {
  const { t } = useT()
  if (!sync) return null
  let text
  if (sync.source === 'simulation') text = t('chain_simulation')
  else if (sync.source === 'database') text = t('chain_db')
  else if (sync.synced) text = t('chain_synced')
  else text = t('chain_reading', { scanned: sync.scanned_to || 0, latest: sync.latest || '?' })
  return <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">{text}</p>
}

async function sha256Hex(file) {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('')
}

// The return photo never leaves the phone: its fingerprint is compared with the INSPECTION proofs.
function PhotoCheck({ history }) {
  const { t } = useT()
  const [result, setResult] = useState(null)
  const proofs = history.filter((h) => h.event_type === 'INSPECTION' && h.details?.photo_sha256)
  if (!proofs.length || !window.crypto?.subtle) return null
  const check = async (file) => {
    if (!file) return
    const digest = await sha256Hex(file)
    const hit = proofs.find((h) => h.details.photo_sha256.toLowerCase() === digest)
    setResult(hit ? { ok: true, text: t('verify_ok', { t: Math.round(hit.t) }) } : { ok: false, text: t('verify_ko') })
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <IconBubble icon={Fingerprint} tone="foam" />
        <div className="space-y-1">
          <CardTitle>{t('verify_title')}</CardTitle>
          <CardDescription>{t('verify_text')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <input id="verify-photo" type="file" accept="image/*" className="hidden" onChange={(e) => check(e.target.files?.[0])} />
        <Button variant="outline" className="w-full" onClick={() => document.getElementById('verify-photo').click()}>{t('verify_pick')}</Button>
        {result && (
          <p className={cn('mt-3 rounded-xl px-3 py-2 text-sm font-bold', result.ok ? 'bg-foam text-ocean-700' : 'bg-coral-50 text-coral')}>
            {result.text}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function formatDay(iso, lang) {
  if (!iso) return ''
  const locales = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }
  try { return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locales[lang] || 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) } catch { return iso }
}

function SponsorCard({ sp }) {
  const { t, lang } = useT()
  const images = sp.media.filter((m) => m.kind === 'image')
  const videos = sp.media.filter((m) => m.kind === 'video')
  const period = sp.end_date
    ? t('sponsor_period', { start: formatDay(sp.start_date, lang), end: formatDay(sp.end_date, lang) })
    : t('sponsor_since', { start: formatDay(sp.start_date, lang) })
  return (
    <Card className="overflow-hidden">
      {sp.design_url && <img src={sp.design_url} alt={t('design_by', { artist: sp.artist_name })} className="max-h-80 w-full bg-foam object-contain" />}
      <CardContent className="space-y-4 pt-5">
        <div>
          <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-cork-700">
            <Sparkles className="h-3.5 w-3.5" /> {t('design_by', { artist: '' }).trim()}
          </div>
          <div className="text-2xl font-extrabold">{sp.artist_name}</div>
          {sp.artist_bio && <p className="mt-1 text-sm text-muted-foreground">{sp.artist_bio}</p>}
        </div>
        {images.length > 0 && (
          <div>
            <div className="text-sm font-bold">{t('gallery')}</div>
            <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-1">
              {images.map((m) => (
                <figure key={m.id} className="w-40 shrink-0 snap-start">
                  <img src={m.url} alt={m.caption || sp.artist_name} className="h-32 w-40 rounded-xl object-cover" />
                  {m.caption && <figcaption className="mt-1 text-xs text-muted-foreground">{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        )}
        {videos.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-bold hover:bg-accent">
            <Play className="h-4 w-4 text-ocean" /> {m.caption || t('watch_video')} <ExternalLink className="ml-auto h-3.5 w-3.5" />
          </a>
        ))}
        <div className="rounded-2xl bg-navy p-4 text-white">
          <div className="font-bold">{t('sponsored_by', { sponsor: sp.sponsor_name })}</div>
          <div className="text-xs text-white/60">{period}</div>
          {sp.message && <p className="mt-2 font-script text-lg text-sun">« {sp.message} »</p>}
          {sp.sponsor_url && (
            <a href={sp.sponsor_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-lagoon hover:underline">
              {t('visit_sponsor', { sponsor: sp.sponsor_name })} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {sp.chain?.tx_hash && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t('on_chain_art')} <TxLink hash={sp.chain.tx_hash} url={sp.chain.url} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ShareButton({ board }) {
  const { t } = useT()
  const [done, setDone] = useState(false)
  const share = async () => {
    const text = t('story_text', { board })
    try {
      if (navigator.share) await navigator.share({ title: 'Grab&Surf', text, url: window.location.href })
      else { await navigator.clipboard.writeText(`${text} ${window.location.href}`); setDone(true) }
    } catch { /* closed */ }
  }
  return <Button variant="sun" size="lg" className="w-full" onClick={share}><Share2 /> {done ? t('link_copied') : t('share_story')}</Button>
}

function ReturnHere({ rental, board, reload }) {
  const { t } = useT()
  const [rack, setRack] = useState(session.recentRack())
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const submit = async () => {
    setBusy(true); setError(null)
    try { await api.manualReturn(rental.id, rack, board); setDone(true); if (reload) await reload() } catch (err) { setError(err.message) }
    setBusy(false)
  }
  if (done) return <p className="rounded-2xl bg-foam p-4 font-bold text-ocean-700">{t('returned_ok')}</p>
  return (
    <Card className="border-navy/30">
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <IconBubble icon={Undo2} />
        <div className="space-y-1">
          <CardTitle>{t('return_here')}</CardTitle>
          <CardDescription>{rack ? t('return_here_text', { rack }) : t('return_scan_rack')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ErrorNote error={error} />
        {rack ? (
          <Button size="lg" className="w-full" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="animate-spin" />} {t('return_confirm')}
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setScanning(true)}><QrCode /> {t('scan')}</Button>
        )}
      </CardContent>
      {scanning && (
        <QrScanner expect="rack" onClose={() => setScanning(false)}
          onResult={(r) => { setScanning(false); session.rememberRack(r.id); setRack(r.id) }} />
      )}
    </Card>
  )
}

function DamageCard({ board }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const [zone, setZone] = useState('nose')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)
  if (!session.token()) return null
  const send = async () => {
    setBusy(true); setError(null)
    try { setMsg((await api.reportDamage(board, zone)).message) } catch (err) { setError(err.message) }
    setBusy(false)
  }
  if (!open) {
    return (
      <Button variant="link" className="w-full text-muted-foreground" onClick={() => setOpen(true)}>
        <AlertTriangle /> {t('report_damage')}
      </Button>
    )
  }
  return (
    <Card>
      <CardHeader><CardTitle>{t('report_damage')}</CardTitle></CardHeader>
      <CardContent>
        {msg ? <p className="text-sm">{msg}</p> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {ZONES.map((z) => (
                <button key={z} onClick={() => setZone(z)}
                  className={cn('rounded-xl border px-3 py-2.5 text-sm font-bold transition',
                    zone === z ? 'border-navy bg-navy text-white' : 'bg-white hover:bg-muted')}>
                  {t(`zone_${z}`)}
                </button>
              ))}
            </div>
            <ErrorNote error={error} />
            <Button variant="destructive" size="lg" className="w-full" disabled={busy} onClick={send}>
              {busy && <Loader2 className="animate-spin" />} {t('send_report')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
