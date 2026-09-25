import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ClipboardCheck, KeyRound, LayoutDashboard, QrCode, Wallet } from 'lucide-react'
import { session } from '@/api.js'
import { LangSwitch, useT } from '@/i18n.jsx'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Logo, Money } from '@/components/common.jsx'

// Two layers of waves closing the dark headers, as on the deck slides.
export function Waves({ className = '' }) {
  return (
    <svg viewBox="0 0 1440 90" preserveAspectRatio="none" className={cn('block h-10 w-full sm:h-14', className)} aria-hidden>
      <path d="M0,40 C240,80 480,0 720,30 C960,60 1200,10 1440,40 L1440,90 L0,90 Z" fill="#1BA8C8" opacity=".55" />
      <path d="M0,60 C260,30 520,90 760,60 C1000,30 1220,80 1440,55 L1440,90 L0,90 Z" fill="hsl(var(--background))" />
    </svg>
  )
}

// Header of the customer pages: logo, language flags, wallet on top, then the page title.
export function CustomerHeader({ walletCents = null, children }) {
  const { t } = useT()
  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 pt-4">
        <Link to="/" aria-label="Grab&Surf"><Logo className="h-12" /></Link>
        <LangSwitch dark />
      </div>
      {walletCents !== null && (
        <div className="mx-auto mt-4 max-w-md px-4">
          <div className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
            <span className="flex items-center gap-2 text-sm text-white/80"><Wallet className="h-4 w-4 text-sun" /> {t('wallet')}</span>
            <span className="text-xl font-extrabold text-sun"><Money cents={walletCents} /></span>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-md px-4 pb-2 pt-5">{children}</div>
      <Waves />
    </header>
  )
}

const ROLES = [['exploitant', 'Exploitant'], ['tournee', 'Tournée'], ['reparateur', 'Réparateur'], ['ecole', 'École de surf']]
const ROLE_KEY = 'gs_operator_role'

// The validator's role (never a name), shared by the staff pages.
export function useRole() {
  const [role, setRoleState] = useState(() => {
    try { return localStorage.getItem(ROLE_KEY) || 'exploitant' } catch { return 'exploitant' }
  })
  const setRole = (r) => { setRoleState(r); try { localStorage.setItem(ROLE_KEY, r) } catch { /* private mode */ } }
  return [role, setRole]
}

const STAFF_LINKS = [
  ['/operator', 'Tableau de bord', LayoutDashboard],
  ['/operator/inspection', 'Inspection', ClipboardCheck],
  ['/owner', 'Propriétaire', QrCode],
]

// Shell of the operator and owner pages: dark top bar, navigation, role picker.
export function StaffLayout({ role, setRole, actions, children }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-navy text-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to="/" aria-label="Grab&Surf"><Logo className="h-9" /></Link>
            <nav className="flex gap-1">
              {STAFF_LINKS.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end className={({ isActive }) => cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold transition',
                  isActive ? 'bg-white text-navy' : 'text-white/70 hover:bg-white/10 hover:text-white')}>
                  <Icon className="h-4 w-4" /><span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {setRole && (
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 w-40 rounded-full border-white/15 bg-white/10 text-white" aria-label="Rôle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {actions}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 print:p-0">{children}</main>
    </div>
  )
}

// Page title of the staff pages.
export function PageTitle({ kicker, title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div>
        {kicker && <div className="text-xs font-bold uppercase tracking-widest text-ocean-700">{kicker}</div>}
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-muted-foreground">{children}</p>}
      </div>
      {actions}
    </div>
  )
}

export function PinGate({ onSaved }) {
  const [pin, setPin] = useState('')
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <Logo className="mx-auto h-24" />
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-ocean" /> Espace pro</CardTitle>
            <CardDescription>Entre le code PIN exploitant pour continuer.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); session.setPin(pin); onSaved() }} className="space-y-3">
              <Label htmlFor="pin">Code PIN</Label>
              <Input id="pin" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
              <Button size="lg" className="w-full">Entrer</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
