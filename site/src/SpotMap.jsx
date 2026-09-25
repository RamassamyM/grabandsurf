import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { appUrl } from './config.js'
import Icon from './Icon.jsx'
import { REGIONS, SPOTS, searchSpots } from './spots.js'

const TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const COAST = L.latLngBounds([[35.8, -9.6], [50.2, 1.2]])

function pinIcon(open, active) {
  const size = active ? 38 : 30
  const fill = open ? '#F7B32B' : '#1BA8C8'
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="filter:drop-shadow(0 2px 3px rgba(11,37,51,.35))">
      <path d="M12 23s8-7 8-13A8 8 0 0 0 4 10c0 6 8 13 8 13z" fill="${fill}" stroke="#0B2533" stroke-width="1.6"/>
      <circle cx="12" cy="10" r="3.2" fill="#fff" stroke="#0B2533" stroke-width="1.4"/></svg>`,
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Map of the rental spots with zoom, search and filters (Leaflet, no API key).
export default function SpotMap({ lang, t }) {
  const holder = useRef(null)
  const map = useRef(null)
  const markers = useRef({})
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState('all')
  const [active, setActive] = useState(null)

  const results = useMemo(
    () => searchSpots(query, lang).filter((s) => country === 'all' || s.country === country)
      .sort((a, b) => Number(Boolean(b.station)) - Number(Boolean(a.station))),
    [query, lang, country],
  )
  const openCount = SPOTS.filter((s) => s.station).length

  const popupHtml = (s) => {
    const status = s.station
      ? `<span class="gs-pill gs-open">${escapeHtml(t.open)}</span>`
      : `<span class="gs-pill gs-soon">${escapeHtml(t.soon)}</span>`
    const rent = s.station ? `<a class="gs-rent" href="${appUrl(`/s/${s.station}`)}">${escapeHtml(t.rent)}</a>` : ''
    return `<div class="gs-pop"><div class="gs-name">${escapeHtml(s.name)}</div>
      <div class="gs-town">${escapeHtml(s.town)} · ${escapeHtml(REGIONS[s.region][lang])}</div>${status}${rent}</div>`
  }

  useEffect(() => {
    const m = L.map(holder.current, { zoomControl: true, scrollWheelZoom: false, maxBounds: COAST.pad(0.3), minZoom: 5 })
    L.tileLayer(TILES, { attribution: ATTRIBUTION, subdomains: 'abcd', maxZoom: 18 }).addTo(m)
    m.fitBounds(COAST)
    m.on('focus', () => m.scrollWheelZoom.enable())
    m.on('blur', () => m.scrollWheelZoom.disable())
    map.current = m
    SPOTS.forEach((s) => {
      const mk = L.marker([s.lat, s.lng], { icon: pinIcon(Boolean(s.station), false), title: `${s.name}, ${s.town}` })
      mk.on('click', () => setActive(s.id))
      mk.addTo(m)
      markers.current[s.id] = mk
    })
    return () => { m.remove(); map.current = null; markers.current = {} }
  }, [])

  // Popups follow the language and the live number of boards.
  useEffect(() => {
    SPOTS.forEach((s) => {
      const mk = markers.current[s.id]
      if (!mk) return
      mk.bindPopup(popupHtml(s), { closeButton: false })
      mk.setIcon(pinIcon(Boolean(s.station), s.id === active))
    })
    if (active && markers.current[active]) markers.current[active].openPopup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, active])

  // Only the spots matching the search stay on the map.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const keep = new Set(results.map((s) => s.id))
    SPOTS.forEach((s) => {
      const mk = markers.current[s.id]
      if (keep.has(s.id)) { if (!m.hasLayer(mk)) mk.addTo(m) } else if (m.hasLayer(mk)) m.removeLayer(mk)
    })
    if ((query || country !== 'all') && results.length) {
      m.flyToBounds(L.latLngBounds(results.map((s) => [s.lat, s.lng])).pad(0.4), { maxZoom: 12, duration: 0.8 })
    }
  }, [results, query, country])

  const focus = (s) => {
    setActive(s.id)
    map.current?.flyTo([s.lat, s.lng], 13, { duration: 0.8 })
  }
  const reset = () => { setQuery(''); setCountry('all'); setActive(null); map.current?.flyToBounds(COAST, { duration: 0.8 }) }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="order-2 flex min-w-0 flex-col rounded-3xl bg-white p-4 shadow-lg lg:order-1 lg:max-h-[560px]">
        <label className="relative block">
          <span className="sr-only">{t.search}</span>
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} type="search"
            className="w-full rounded-full border-2 border-foam-200 bg-foam-50 py-3 pl-11 pr-4 text-night-900 placeholder:text-slate-600/70 focus:border-lagoon-500 focus:outline-none" />
        </label>
        <div className="mt-3 flex flex-wrap gap-2" role="group">
          {[['all', t.all], ['FR', t.france], ['ES', t.spain]].map(([id, label]) => (
            <button key={id} onClick={() => setCountry(id)} aria-pressed={country === id}
              className={`rounded-full px-3 py-1 text-sm font-bold transition ${country === id ? 'bg-night-900 text-white' : 'bg-foam-100 text-night-900 hover:bg-foam-200'}`}>
              {label}
            </button>
          ))}
          {(query || country !== 'all' || active) && (
            <button onClick={reset} className="ml-auto text-sm font-bold text-lagoon-600 underline">↺</button>
          )}
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-600">
          {t.count.replace('{open}', openCount).replace('{soon}', SPOTS.length - openCount)}
        </p>
        <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 max-lg:max-h-72">
          {results.map((s) => {
            return (
              <li key={s.id}>
                <button onClick={() => focus(s)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${active === s.id ? 'bg-foam-100' : 'hover:bg-foam-50'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.station ? 'bg-sun-500 text-night-900' : 'bg-lagoon-500 text-white'}`}>
                    <Icon name="pin" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-night-900">{s.name}</span>
                    <span className="block truncate text-sm text-slate-600">
                      {s.town} · {REGIONS[s.region][lang]}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${s.station ? 'bg-sun-500 text-night-900' : 'bg-foam-100 text-slate-600'}`}>
                    {s.station ? t.open : t.soon}
                  </span>
                </button>
              </li>
            )
          })}
          {!results.length && <li className="px-3 py-6 text-center text-slate-600">{t.none}</li>}
        </ul>
        {active && SPOTS.find((s) => s.id === active)?.station && (
          <a href={appUrl(`/s/${SPOTS.find((s) => s.id === active).station}`)}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-sun-500 px-5 py-3 font-extrabold text-night-900 hover:bg-sun-400">
            {t.rent} <Icon name="arrow" className="h-5 w-5" />
          </a>
        )}
      </div>
      <div ref={holder} className="order-1 h-[420px] min-w-0 overflow-hidden rounded-3xl shadow-lg ring-4 ring-white/10 lg:order-2 lg:h-[560px]"
        role="region" aria-label={t.title} tabIndex={0} />
    </div>
  )
}
