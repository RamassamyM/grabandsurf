import { Suspense, lazy } from 'react'
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import StationPage from './pages/client/StationPage.jsx'
import PassportPage from './pages/passport/PassportPage.jsx'
import OperatorPage from './pages/operator/OperatorPage.jsx'
import PartnerPage from './pages/partner/PartnerPage.jsx'
import InspectionPage from './pages/operator/InspectionPage.jsx'
import OwnerPage from './pages/owner/OwnerPage.jsx'
import ClaimPage from './pages/claim/ClaimPage.jsx'
import DemoPage, { PhoneSwitchButton } from './pages/demo/DemoPage.jsx'
import { isEmbedded } from './api.js'

// The landing page (and its map library) loads on its own, the rental pages stay light.
const LandingPage = lazy(() => import('./pages/landing/LandingPage.jsx'))
const landing = <Suspense fallback={<div className="min-h-dvh bg-[#0B2533]" />}><LandingPage /></Suspense>
import { Card, Logo } from './components/ui.jsx'
import { LangSwitch } from './i18n.jsx'

function Home() {
  const links = [
    ['/s/A', 'Client', 'Rack A, parcours de location'],
    ['/p/korko-01', 'Passeport', 'La planche korko-01'],
    ['/demo?url=/s/A', 'Démo téléphone', 'Le parcours client dans un téléphone : navigateur, appareil photo, SMS'],
    ['/operator', 'Exploitant', 'Tableau de bord du parc'],
    ['/operator/inspection', 'Inspection', 'Vérifier les retours, libérer les cautions'],
    ['/owner', 'Propriétaire', 'QR à imprimer, forfaits de réparation'],
    ['/partner/maif', 'Partenaire', 'Tableau MAIF'],
  ]
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="flex items-center justify-between"><Logo /><LangSwitch /></div>
      <p className="mt-3 text-ocean-700">Des planches en liège en libre-service. Scanne, surfe, raccroche.</p>
      <div className="mt-8 space-y-3">
        {links.map(([to, title, text]) => (
          <Link key={to} to={to} className="block">
            <Card className="transition hover:-translate-y-0.5">
              <div className="font-display text-lg font-semibold">{title}</div>
              <div className="text-sm text-ocean-700">{text}</div>
            </Card>
          </Link>
        ))}
      </div>
    </main>
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
      <Route path="/" element={landing} />
      <Route path="/app" element={<Home />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/s/:station" element={<Customer><StationPage /></Customer>} />
      <Route path="/p/:board" element={<Customer><PassportPage /></Customer>} />
      <Route path="/claim/:token" element={<Customer><ClaimPage /></Customer>} />
      <Route path="/operator" element={<OperatorPage />} />
      <Route path="/operator/inspection" element={<InspectionPage />} />
      <Route path="/owner" element={<OwnerPage />} />
      <Route path="/partner/:id" element={<PartnerPage />} />
      <Route path="*" element={landing} />
    </Routes>
  )
}
