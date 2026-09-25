import { Link, Route, Routes } from 'react-router-dom'
import StationPage from './pages/client/StationPage.jsx'
import PassportPage from './pages/passport/PassportPage.jsx'
import OperatorPage from './pages/operator/OperatorPage.jsx'
import PartnerPage from './pages/partner/PartnerPage.jsx'
import { Card, Logo } from './components/ui.jsx'

function Home() {
  const links = [
    ['/s/A', 'Client', 'Rack A, parcours de location'],
    ['/p/korko-01', 'Passeport', 'La planche korko-01'],
    ['/operator', 'Exploitant', 'Tableau de bord du parc'],
    ['/partner/maif', 'Partenaire', 'Tableau MAIF'],
  ]
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <Logo />
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/s/:station" element={<StationPage />} />
      <Route path="/p/:board" element={<PassportPage />} />
      <Route path="/operator" element={<OperatorPage />} />
      <Route path="/partner/:id" element={<PartnerPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}
