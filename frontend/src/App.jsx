import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight, BookOpen, ClipboardCheck, Handshake, LayoutDashboard, QrCode, Smartphone, Waves as WavesIcon,
} from 'lucide-react'
import StationPage from './pages/client/StationPage.jsx'
import PassportPage from './pages/passport/PassportPage.jsx'
import OperatorPage from './pages/operator/OperatorPage.jsx'
import PartnerPage from './pages/partner/PartnerPage.jsx'
import InspectionPage from './pages/operator/InspectionPage.jsx'
import OwnerPage from './pages/owner/OwnerPage.jsx'
import ClaimPage from './pages/claim/ClaimPage.jsx'
import DemoPage, { PhoneSwitchButton } from './pages/demo/DemoPage.jsx'
import { isEmbedded } from './api.js'
import { IconBubble, Logo, Script } from './components/common.jsx'
import { Waves } from './components/Layout.jsx'
import { LangSwitch, useT } from './i18n.jsx'

const SPACES = [
  ['Surfeur', [
    ['/s/A', 'Louer au rack A', 'Le parcours de location, de ton numéro au reçu', WavesIcon, 'sun'],
    ['/demo?url=/s/A', 'Démo téléphone', 'Le parcours dans un téléphone : navigateur, appareil photo, SMS', Smartphone, 'ocean'],
    ['/p/korko-01', 'Passeport de planche', 'Le carnet de vie de korko-01', BookOpen, 'foam'],
  ]],
  ['Exploitant', [
    ['/operator', 'Tableau de bord', 'Le parc en direct, alertes et missions', LayoutDashboard, 'navy'],
    ['/operator/inspection', 'Inspection', 'Vérifier les retours, libérer les cautions', ClipboardCheck, 'navy'],
    ['/owner', 'Propriétaire', 'QR à imprimer, forfaits, parrainages', QrCode, 'navy'],
  ]],
  ['Partenaire', [
    ['/partner/maif', 'Espace MAIF', 'Heures offertes, sessions et preuves, parrainage', Handshake, 'sun'],
  ]],
]

function Home() {
  const { t } = useT()
  return (
    <div className="min-h-dvh pb-16">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-3xl justify-end px-4 pt-4"><LangSwitch dark /></div>
        <div className="mx-auto max-w-3xl px-4 pb-4 text-center">
          <Logo className="mx-auto h-40 sm:h-52" />
          <p className="mt-4 text-xl font-bold">{t('tagline')} <Script className="text-2xl">{t('tagline_sub')}</Script></p>
        </div>
        <Waves />
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4">
        {SPACES.map(([title, links]) => (
          <section key={title}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {links.map(([to, label, text, icon, tone]) => (
                <Link key={to} to={to}
                  className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-ocean/40">
                  <IconBubble icon={icon} tone={tone} />
                  <div>
                    <div className="flex items-center gap-1 font-extrabold">
                      {label} <ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <div className="text-sm text-muted-foreground">{text}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

// Customer pages get a switch that opens them inside the phone mockup (not shown inside the mockup itself).
function Customer({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <>
      {children}
      {!isEmbedded() && (
        <div className="fixed bottom-4 left-4 z-50 print:hidden">
          <PhoneSwitchButton onClick={() => navigate(`/demo?url=${encodeURIComponent(location.pathname + location.search)}`)} />
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/s/:station" element={<Customer><StationPage /></Customer>} />
      <Route path="/p/:board" element={<Customer><PassportPage /></Customer>} />
      <Route path="/claim/:token" element={<Customer><ClaimPage /></Customer>} />
      <Route path="/operator" element={<OperatorPage />} />
      <Route path="/operator/inspection" element={<InspectionPage />} />
      <Route path="/owner" element={<OwnerPage />} />
      <Route path="/partner/:id" element={<PartnerPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
