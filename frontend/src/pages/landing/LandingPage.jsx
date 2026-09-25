import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { LangSwitch, useT } from '../../i18n.jsx'
import { CONTENT, RIDERS } from './content.js'
import Icon from './Icon.jsx'
import SpotMap from './SpotMap.jsx'

// Public landing page: the concept (from the pitch deck), the board passport, the riders and the map of spots.
export default function LandingPage() {
  const { lang } = useT()
  const c = CONTENT[lang] || CONTENT.fr
  useEffect(() => {
    document.title = `Grab&Surf · ${c.hero.title}`
  }, [c])
  return (
    <div className="bg-white font-outfit text-night-900">
      <Nav c={c.nav} />
      <Hero c={c.hero} />
      <Problem c={c.problem} />
      <Gestures c={c.gestures} />
      <Auto c={c.auto} />
      <Passport c={c.passport} />
      <Riders c={c.riders} lang={lang} />
      <Worry c={c.worry} />
      <Pros c={c.pros} />
      <section id="spots" className="scroll-mt-16 bg-night-900 px-4 py-20 text-white">
        <div className="mx-auto max-w-6xl">
          <Heading title={c.spots.title} light />
          <p className="mt-3 max-w-2xl text-lg text-foam-300">{c.spots.text}</p>
          <div className="mt-8"><SpotMap lang={lang} t={c.spots} /></div>
        </div>
      </section>
      <Final c={c.final} />
      <Footer c={c.footer} nav={c.nav} />
    </div>
  )
}

function Heading({ title, accent, light = false, center = false }) {
  return (
    <h2 className={`text-4xl font-extrabold leading-tight sm:text-5xl ${light ? 'text-white' : 'text-night-900'} ${center ? 'text-center' : ''}`}>
      {title}
      {accent && <span className={`block font-brush font-normal ${light ? 'text-sun-500' : 'text-lagoon-500'}`}>{accent}</span>}
    </h2>
  )
}

function Wave({ from = '#A7E6F2', to = '#1BA8C8', flip = false, className = '' }) {
  return (
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className={`block h-16 w-full sm:h-24 ${flip ? 'rotate-180' : ''} ${className}`} aria-hidden="true">
      <path d="M0 50c160-25 330-20 520 5 190 26 330 30 520 0 170-26 290-30 400-12v77H0z" fill={from} />
      <path d="M0 76c200-22 420-16 600 4 200 22 370 20 540-6 130-20 220-14 300 4v42H0z" fill={to} />
    </svg>
  )
}

function Nav({ c }) {
  const [open, setOpen] = useState(false)
  const links = [['concept', c.concept], ['passport', c.passport], ['riders', c.riders], ['pros', c.pros], ['spots', c.spots]]
  return (
    <header className="sticky top-0 z-[1100] bg-night-900/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <a href="#top" className="flex items-center gap-2" aria-label="Grab&Surf">
          <img src="/brand/logo.webp" alt="" className="h-10 w-auto" />
        </a>
        <nav className="hidden items-center gap-5 text-sm font-bold lg:flex">
          {links.map(([id, label]) => <a key={id} href={`#${id}`} className="text-white/80 hover:text-sun-500">{label}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <a href="#spots" className="hidden rounded-full bg-sun-500 px-4 py-2 text-sm font-extrabold text-night-900 hover:bg-sun-400 sm:inline-block">{c.cta}</a>
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-white/10 px-4 pb-4 lg:hidden">
          {links.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={() => setOpen(false)} className="block py-2 font-bold text-white/90">{label}</a>
          ))}
        </nav>
      )}
    </header>
  )
}

function Hero({ c }) {
  return (
    <section id="top" className="relative overflow-hidden bg-night-900 text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sun-500/20 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-20">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-lagoon-300">{c.kicker}</p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[1.05] sm:text-6xl">{c.title}</h1>
          <p className="mt-2 font-brush text-4xl text-sun-500 sm:text-5xl">{c.accent}</p>
          <p className="mt-6 max-w-lg text-lg text-foam-300">{c.text}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#spots" className="inline-flex items-center gap-2 rounded-full bg-sun-500 px-6 py-3.5 text-lg font-extrabold text-night-900 hover:bg-sun-400">
              <Icon name="pin" className="h-5 w-5" /> {c.find}
            </a>
            <Link to="/demo?url=/s/A" className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-6 py-3.5 text-lg font-bold hover:border-white">
              <Icon name="qr" className="h-5 w-5" /> {c.demo}
            </Link>
          </div>
        </div>
        <img src="/brand/logo.webp" alt="Grab&Surf" className="mx-auto w-full max-w-md drop-shadow-2xl" width="720" height="479" />
      </div>
      <Wave from="#5FD3E8" to="#E6F7FB" />
    </section>
  )
}

function Problem({ c }) {
  return (
    <section id="concept" className="scroll-mt-16 bg-foam-100 px-4 pb-20 pt-10">
      <div className="mx-auto max-w-6xl">
        <Heading title={c.title} accent={c.accent} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {c.items.map(([icon, title, text]) => (
            <div key={title} className="rounded-3xl bg-white p-6 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-night-900 text-sun-500"><Icon name={icon} /></span>
              <h3 className="mt-4 text-xl font-extrabold">{title}</h3>
              <p className="mt-1 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Gestures({ c }) {
  return (
    <section className="bg-lagoon-500 px-4 py-20 text-white">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-extrabold text-night-900 sm:text-4xl">
          {c.title} <span className="block font-brush text-6xl font-normal text-white sm:text-7xl">{c.accent}</span>
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {c.steps.map(([icon, title, text], i) => (
            <div key={title} className="flex gap-5 rounded-3xl bg-white p-6 text-night-900 shadow-lg">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sun-500 text-night-900">
                <Icon name={icon} className="h-8 w-8" />
              </span>
              <div>
                <div className="text-sm font-extrabold text-lagoon-600">0{i + 1}</div>
                <h3 className="text-2xl font-extrabold">{title}</h3>
                <p className="mt-1 text-slate-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xl font-bold">{c.note}</p>
      </div>
    </section>
  )
}

function Auto({ c }) {
  return (
    <section className="bg-night-900 px-4 py-20 text-white">
      <div className="mx-auto max-w-6xl">
        <Heading title={c.title} accent={c.accent} light />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.items.map(([icon, title, text]) => (
            <div key={title} className="rounded-3xl bg-night-700 p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lagoon-500 text-white"><Icon name={icon} /></span>
              <h3 className="mt-4 text-xl font-extrabold">{title}</h3>
              <p className="mt-1 text-foam-300">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Passport({ c }) {
  return (
    <section id="passport" className="scroll-mt-16 bg-night-900 px-4 pb-20 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-[2rem] bg-night-700 p-6 sm:p-10 md:grid-cols-2">
        <div>
          <Heading title={c.title} accent={c.accent} light />
          <p className="mt-4 text-lg text-foam-300">{c.text}</p>
          <p className="mt-4 font-bold text-sun-500">{c.caption}</p>
          <Link to="/p/korko-01" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-extrabold text-night-900 hover:bg-foam-100">
            {c.cta} <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
        <div className="rounded-3xl bg-white p-6 text-night-900 shadow-xl">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-extrabold">korko-07</span>
            <span className="rounded-full bg-foam-100 px-3 py-1 text-xs font-bold text-slate-600">{c.example}</span>
          </div>
          <ol className="mt-5 space-y-4 border-l-4 border-foam-200 pl-5">
            {c.timeline.map(([icon, label], i) => (
              <li key={label} className="relative">
                <span className={`absolute -left-[38px] flex h-8 w-8 items-center justify-center rounded-full ${i === c.timeline.length - 1 ? 'bg-sun-500' : 'bg-lagoon-500 text-white'}`}>
                  <Icon name={icon} className="h-4 w-4" />
                </span>
                <span className="text-lg font-bold">{label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-foam-50 px-3 py-2 text-xs font-bold text-slate-600">
            <Icon name="shield" className="h-4 w-4 text-lagoon-600" /> Avalanche · Fuji
          </div>
        </div>
      </div>
    </section>
  )
}

function Riders({ c, lang }) {
  return (
    <section id="riders" className="scroll-mt-16 bg-lagoon-500 px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <Heading title={c.title} accent={c.accent} light />
        <p className="mt-3 max-w-2xl text-lg font-bold text-night-900">{c.text}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {RIDERS.map((r) => (
            <article key={r.board} className="flex flex-col rounded-3xl bg-white p-5 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-night-900 font-brush text-3xl text-sun-500">{r.name[0]}</span>
                <div>
                  <h3 className="text-xl font-extrabold">{r.name}</h3>
                  <p className="text-sm text-slate-600">{r.tagline[lang] || r.tagline.fr}</p>
                </div>
              </div>
              <p className="mt-4 flex-1 italic text-night-900">« {r.story[lang] || r.story.fr} »</p>
              <Link to={`/p/${r.board}`} className="mt-4 flex items-center justify-between rounded-2xl bg-foam-100 px-4 py-2 text-sm font-bold hover:bg-foam-200">
                <span>{c.surfed} <span className="font-extrabold">{r.board}</span></span>
                <Icon name="arrow" className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-night-900/80">{c.fictional}</p>
      </div>
    </section>
  )
}

function Worry({ c }) {
  return (
    <section className="bg-foam-100 px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-brush text-5xl text-night-900 sm:text-6xl">{c.title}</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {c.items.map(([icon, title, text]) => (
            <div key={title} className="rounded-3xl bg-white p-6 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sun-500 text-night-900"><Icon name={icon} /></span>
              <h3 className="mt-4 text-2xl font-extrabold">{title}</h3>
              <p className="mt-1 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pros({ c }) {
  return (
    <section id="pros" className="scroll-mt-16 bg-white px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <Heading title={c.title} />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {c.items.map(([icon, who, title, text]) => (
            <div key={who} className="rounded-3xl border-2 border-foam-200 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lagoon-500 text-white"><Icon name={icon} /></span>
                <span className="text-sm font-extrabold uppercase tracking-wider text-lagoon-600">{who}</span>
              </div>
              <h3 className="mt-4 text-2xl font-extrabold">{title}</h3>
              <p className="mt-2 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/partner/maif" className="inline-flex items-center gap-2 rounded-full bg-night-900 px-6 py-3 font-extrabold text-white hover:bg-night-700">
            {c.partner} <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  )
}

function Final({ c }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/p/korko-01`, { margin: 1, width: 360, color: { dark: '#0B2533', light: '#00000000' } })
      .then(setSrc).catch(() => setSrc(null))
  }, [])
  return (
    <section className="bg-night-900 px-4 pb-20 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
        <div>
          <h2 className="font-brush text-6xl text-sun-500 sm:text-7xl">{c.title}</h2>
          <p className="mt-4 text-xl text-foam-300">{c.text}</p>
          <Link to="/p/korko-01" className="mt-6 inline-flex items-center gap-2 rounded-full bg-sun-500 px-6 py-3 font-extrabold text-night-900 hover:bg-sun-400">
            {c.cta} <Icon name="arrow" className="h-5 w-5" />
          </Link>
        </div>
        <div className="mx-auto flex h-[420px] w-48 items-center justify-center rounded-[50%/22%] bg-corkwood shadow-2xl ring-8 ring-night-700"
          style={{ backgroundImage: 'radial-gradient(rgba(107,72,32,.35) 1px, transparent 1.5px), radial-gradient(rgba(255,236,200,.3) 1px, transparent 1.5px)', backgroundSize: '9px 9px, 13px 13px' }}>
          {src && <img src={src} alt="QR korko-01" className="w-32 mix-blend-multiply" />}
        </div>
      </div>
    </section>
  )
}

function Footer({ c, nav }) {
  return (
    <footer className="bg-night-900 px-4 pb-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 border-t border-white/10 pt-8">
        <div className="flex items-center gap-3">
          <img src="/brand/logo.webp" alt="Grab&Surf" className="h-12 w-auto" />
          <p className="text-sm text-foam-300">{c.tagline}</p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm font-bold text-white/80">
          <a href="#spots" className="hover:text-sun-500">{nav.spots}</a>
          <Link to="/app" className="hover:text-sun-500">{c.demo}</Link>
          <Link to="/partner/maif" className="hover:text-sun-500">{c.partner}</Link>
          <Link to="/operator" className="hover:text-sun-500">{c.operator}</Link>
        </nav>
      </div>
    </footer>
  )
}
