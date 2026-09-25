import { useState } from 'react'
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
          <ol className="mt-4 space-y-3 border-l-2 border-cork-300 pl-4">
            {data.history.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-cork-400" />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{t(`ev_${h.event_type}`)}</span>
                  <span className="text-xs text-ocean-700/70">{t('station_t', { station: h.station || '-', t: Math.round(h.t) })}</span>
                </div>
                <TxLink hash={h.tx_hash} url={h.url} />
              </li>
            ))}
          </ol>
          {data.chain.contract_url && (
            <a className="mt-4 block text-sm text-ocean-500 underline" href={data.chain.contract_url} target="_blank" rel="noreferrer">
              {t('see_registry')} ↗
            </a>
          )}
        </Card>

        <ShareCard board={b.id} />
        <DamageCard board={b.id} />
      </main>
    </div>
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
