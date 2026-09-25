import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { api } from '@/api.js'
import { CustomerHeader } from '@/components/Layout.jsx'
import { ErrorNote, Spinner, TxLink, usePoll } from '@/components/common.jsx'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useT } from '@/i18n.jsx'

// Link received by SMS after an implicit purchase: the customer receives the NFT of the board.
export default function ClaimPage() {
  const { t } = useT()
  const { token } = useParams()
  const { data, error, reload } = usePoll(() => api.claim(token), 4000, [token])
  const [wallet, setWallet] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const send = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { await api.sendClaim(token, wallet.trim()); await reload() } catch (x) { setErr(x.message) }
    setBusy(false)
  }

  return (
    <div className="min-h-dvh pb-16">
      <CustomerHeader>
        <h1 className="text-3xl font-extrabold leading-tight">{t('claim_title')}</h1>
        {data && <p className="mt-1 font-script text-4xl text-sun">{data.board_id}</p>}
      </CustomerHeader>
      <main className="mx-auto max-w-md space-y-4 px-4">
        {error && !data && <ErrorNote error={error.message} />}
        {!data && !error && <Spinner label={t('loading')} />}
        {data && (
          <Card>
            <CardContent className="space-y-4 pt-5">
              <p className="text-muted-foreground">{t('claim_text', { board: data.board_id })}</p>
              {data.wallet ? (
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 rounded-xl bg-foam p-3 font-bold text-ocean-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {t('claim_sent', { wallet: `${data.wallet.slice(0, 6)}…${data.wallet.slice(-4)}` })}
                  </p>
                  {data.chain_supports_transfer ? (
                    <div className="flex flex-wrap items-center gap-2">{t('claim_onchain')} <TxLink hash={data.tx_hash} url={data.tx_url} /></div>
                  ) : <p className="text-muted-foreground">{t('claim_v1')}</p>}
                  {data.nft_url && data.tx_hash && (
                    <a href={data.nft_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-ocean-700 hover:underline">
                      {t('claim_see_nft')} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ) : (
                <form onSubmit={send} className="space-y-3">
                  <Label htmlFor="wallet">{t('claim_wallet')}</Label>
                  <Input id="wallet" className="font-mono" placeholder="0x…" value={wallet}
                    onChange={(e) => setWallet(e.target.value)} autoComplete="off" spellCheck={false} />
                  <ErrorNote error={err} />
                  <Button size="lg" className="w-full" disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(wallet.trim())}>
                    {busy && <Loader2 className="animate-spin" />} {t('claim_send')}
                  </Button>
                </form>
              )}
              <Link to={`/p/${data.board_id}`} className="flex items-center gap-1 text-sm font-bold text-ocean-700 hover:underline">
                {t('passport')} {data.board_id} <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
