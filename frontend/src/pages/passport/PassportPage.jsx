import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, session } from '../../api.js'
import QrScanner from '../../components/QrScanner.jsx'
import { Button, Card, ErrorNote, Logo, Spinner, StatusBadge, TxLink, usePoll } from '../../components/ui.jsx'
import { LangSwitch, useT } from '../../i18n.jsx'
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
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="flex items-center justify-between"><Logo /><LangSwitch /></div>
        <Card className="mt-6"><ErrorNote error={error.status === 404 ? t('unknown_board') : error.message} /></Card>
      </main>
    )
  }
  if (!data) return <main className="mx-auto max-w-md px-4"><Spinner label={t('loading')} /></main>

  const b = data.board
  const mine = me.data?.current_rental?.board_id === b.id ? me.data.current_rental : null
  const lastMine = me.data?.history?.find((r) => r.board_id === b.id)

  return (
    <div className="min-h-dvh pb-16">
      <header className="cork-texture px-4 pb-10 pt-6 text-white">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between">
            <Link to="/" className="inline-block rounded-lg bg-white/90 px-2 py-1"><Logo small /></Link>
            <LangSwitch />
          </div>
          <div className="mt-8 text-sm uppercase tracking-widest text-white/80">{t('passport')}</div>
          <h1 className="font-display text-5xl font-bold">{b.id}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge status={b.status} label={t(`status_${b.status}`)} />
            <span className="text-white/90">{t('material')} · {t('base', { id: b.home_station })} · {t('nft', { id: b.token_id })}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-5 max-w-md space-y-4 px-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat value={data.sessions} label={t('sessions')} />
          <Stat value={data.minutes_surfed} label={t('minutes_surfed')} />
          <Stat value={data.repairs} label={t('repairs')} />
        </div>

        {data.sponsorship && <SponsorCard sp={data.sponsorship} />}

        {data.ambassador && (
          <Card tone="ocean">
            <div className="text-sm text-white/70">{t('ambassador')}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{data.ambassador.name}</div>
            <div className="text-sm text-white/80">{data.ambassador.tagline}</div>
            <p className="mt-3 italic text-white/95">« {data.ambassador.story} »</p>
            <p className="mt-2 text-xs text-white/60">{t('fictional')}</p>
          </Card>
        )}

        {mine && mine.status !== 'armed' && <ReturnHere rental={mine} board={b.id} reload={me.reload} />}
        {!mine && lastMine && lastMine.status === 'returned' && !lastMine.photo_credited && (
          <Card><PhotoReturn rental={lastMine} reload={me.reload} /></Card>
        )}

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">{t('life_log')}</h2>
            <span className="text-xs text-ocean-700/70">{data.chain.label}</span>
          </div>
          <p className="mt-1 text-xs text-ocean-700/80">{t('life_log_text')}</p>
          {data.history.length === 0 && <p className="mt-4 text-sm text-ocean-700/70">{t('life_log_empty')}</p>}
          <SyncLine sync={data.sync} />
          <ol className="mt-4 space-y-3 border-l-2 border-cork-300 pl-4">
            {data.history.map((h, i) => <HistoryRow key={`${h.tx_hash || 'p'}-${h.event_type}-${i}`} h={h} />)}
          </ol>
          {data.chain.contract_url && (
            <a className="mt-4 block text-sm text-ocean-500 underline" href={data.chain.contract_url} target="_blank" rel="noreferrer">
              {t('see_registry')} ↗
            </a>
          )}
        </Card>

        <PhotoCheck history={data.history} />
        <ShareCard board={b.id} />
        <DamageCard board={b.id} />
      </main>
    </div>
  )
}

const STATUS_TONES = {
  verified: 'bg-ocean-100 text-ocean-700',
  pending: 'bg-sand-200 text-ocean-700',
  reading: 'bg-sand-200 text-ocean-700',
  simulation: 'bg-sand-200 text-ocean-700/80',
  skipped: 'bg-amber-100 text-amber-800',
  rejected: 'bg-coral-400/20 text-coral-600',
  missing: 'bg-coral-400/20 text-coral-600',
}

function HistoryRow({ h }) {
  const { t } = useT()
  const d = h.details || {}
  const dot = h.status === 'verified' ? 'bg-ocean-500' : h.event_type === 'CORRECTION' ? 'bg-coral-500' : 'bg-cork-400'
  const short = (x) => (x ? `${x.slice(0, 10)}…${x.slice(-6)}` : '')
  return (
    <li className="relative">
      <span className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${dot}`} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{t(`ev_${h.event_type}`)}</span>
        <span className="text-xs text-ocean-700/70">{t('station_t', { station: h.station || '-', t: Math.round(h.t) })}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONES[h.status] || 'bg-sand-200'}`}>
          {h.status === 'verified' ? '✓ ' : ''}{t(`st_${h.status}`)}
        </span>
        {h.tx_hash && <TxLink hash={h.tx_hash} url={h.url} />}
      </div>
      {(d.duration_label || d.offered_by) && (
        <div className="mt-1 text-xs text-ocean-700/80">
          {[d.duration_label && t('session_of', { duration: d.duration_label }), d.offered_by && t('offered_by', { partner: d.offered_by })]
            .filter(Boolean).join(' · ')}
        </div>
      )}
      {d.photo_sha256 && (
        <div className="mt-1 text-xs text-ocean-700/80">
          {t('photo_print')} <span className="font-mono">{short(d.photo_sha256)}</span>
          {d.signer && <> · {t('signed_by', { signer: short(d.signer) })}</>}
        </div>
      )}
      {h.event_type === 'CORRECTION' && (
        <div className="mt-1 text-xs text-ocean-700/80">
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
  return <p className="mt-2 rounded-lg bg-sand-50 px-3 py-1.5 text-xs text-ocean-700/80">{text}</p>
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
      <h3 className="font-semibold">{t('verify_title')}</h3>
      <p className="mt-1 text-xs text-ocean-700/80">{t('verify_text')}</p>
      <label className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-ocean-100 px-4 font-semibold text-ocean-700 hover:bg-ocean-50">
        {t('verify_pick')}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => check(e.target.files?.[0])} />
      </label>
      {result && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-medium ${result.ok ? 'bg-ocean-100 text-ocean-700' : 'bg-coral-400/15 text-coral-600'}`}>
          {result.ok ? '✓ ' : ''}{result.text}
        </p>
      )}
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
    <Card className="overflow-hidden p-0">
      {sp.design_url && <img src={sp.design_url} alt={t('design_by', { artist: sp.artist_name })} className="max-h-80 w-full bg-sand-100 object-contain" />}
      <div className="space-y-3 p-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-cork-600">{t('design_by', { artist: '' }).trim()}</div>
          <div className="font-display text-2xl font-semibold">{sp.artist_name}</div>
          {sp.artist_bio && <p className="mt-1 text-sm text-ocean-700">{sp.artist_bio}</p>}
        </div>
        {images.length > 0 && (
          <div>
            <div className="text-sm font-semibold">{t('gallery')}</div>
            <div className="mt-2 flex snap-x gap-2 overflow-x-auto pb-1">
              {images.map((m) => (
                <figure key={m.id} className="w-40 shrink-0 snap-start">
                  <img src={m.url} alt={m.caption || sp.artist_name} className="h-32 w-40 rounded-xl object-cover" />
                  {m.caption && <figcaption className="mt-1 text-xs text-ocean-700/80">{m.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        )}
        {videos.map((m) => (
          <a key={m.id} href={m.url} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 rounded-xl bg-sand-50 px-3 py-2 text-sm font-medium text-ocean-700">
            <span aria-hidden>▶</span> {m.caption || t('watch_video')} ↗
          </a>
        ))}
        <div className="rounded-xl bg-ocean-500 p-3 text-white">
          <div className="font-semibold">{t('sponsored_by', { sponsor: sp.sponsor_name })}</div>
          <div className="text-xs text-white/80">{period}</div>
          {sp.message && <p className="mt-2 text-sm italic">« {sp.message} »</p>}
          {sp.sponsor_url && (
            <a href={sp.sponsor_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold underline">
              {t('visit_sponsor', { sponsor: sp.sponsor_name })} ↗
            </a>
          )}
        </div>
        {sp.chain?.tx_hash && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ocean-700/80">
            {t('on_chain_art')} <TxLink hash={sp.chain.tx_hash} url={sp.chain.url} />
          </div>
        )}
      </div>
    </Card>
  )
}

function Stat({ value, label }) {
  return (
    <Card className="text-center">
      <div className="font-display text-3xl font-bold text-ocean-700">{value}</div>
      <div className="text-xs text-ocean-700/80">{label}</div>
    </Card>
  )
}

function ShareCard({ board }) {
  const { t } = useT()
  const [done, setDone] = useState(false)
  const share = async () => {
    const text = t('story_text', { board })
    try {
      if (navigator.share) await navigator.share({ title: 'Grab&Surf', text, url: window.location.href })
      else { await navigator.clipboard.writeText(`${text} ${window.location.href}`); setDone(true) }
    } catch { /* closed */ }
  }
  return <Button variant="cork" className="w-full" onClick={share}>{done ? t('link_copied') : t('share_story')}</Button>
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
  if (done) return <Card tone="sand"><p className="font-semibold">{t('returned_ok')}</p></Card>
  return (
    <Card tone="sand">
      <h3 className="font-semibold">{t('return_here')}</h3>
      {rack ? (
        <>
          <p className="mt-1 text-sm text-ocean-700">{t('return_here_text', { rack })}</p>
          <div className="mt-2"><ErrorNote error={error} /></div>
          <Button className="mt-3 w-full" busy={busy} onClick={submit}>{t('return_confirm')}</Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-ocean-700">{t('return_scan_rack')}</p>
          <Button className="mt-3 w-full" onClick={() => setScanning(true)}>{t('scan')}</Button>
        </>
      )}
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
  if (!open) return <button className="w-full text-center text-sm text-ocean-700 underline" onClick={() => setOpen(true)}>{t('report_damage')}</button>
  return (
    <Card>
      <h3 className="font-semibold">{t('report_damage')}</h3>
      {msg ? <p className="mt-2 text-sm">{msg}</p> : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ZONES.map((z) => (
              <button key={z} onClick={() => setZone(z)}
                className={`rounded-xl border px-3 py-2 text-sm ${zone === z ? 'border-ocean-500 bg-ocean-50 font-semibold' : 'border-sand-300'}`}>
                {t(`zone_${z}`)}
              </button>
            ))}
          </div>
          <div className="mt-2"><ErrorNote error={error} /></div>
          <Button variant="danger" className="mt-3 w-full" busy={busy} onClick={send}>{t('send_report')}</Button>
        </>
      )}
    </Card>
  )
}
