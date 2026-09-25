import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import { Button, Card, ErrorNote, Logo, Spinner, TxLink, usePoll } from '../../components/ui.jsx'
import { LangSwitch, useT } from '../../i18n.jsx'

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
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <div className="flex items-center justify-between"><Link to="/"><Logo /></Link><LangSwitch /></div>
      {error && !data && <Card><ErrorNote error={error.message} /></Card>}
      {!data && !error && <Spinner label={t('loading')} />}
      {data && (
        <Card>
          <h1 className="font-display text-2xl font-semibold">{t('claim_title')}</h1>
          <p className="mt-2 text-sm text-ocean-700">{t('claim_text', { board: data.board_id })}</p>
          {data.wallet ? (
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-semibold">{t('claim_sent', { wallet: `${data.wallet.slice(0, 6)}…${data.wallet.slice(-4)}` })}</p>
              {data.chain_supports_transfer ? (
                <div className="flex flex-wrap items-center gap-2">{t('claim_onchain')} <TxLink hash={data.tx_hash} url={data.tx_url} /></div>
              ) : <p className="text-ocean-700/80">{t('claim_v1')}</p>}
              {data.nft_url && data.tx_hash && (
                <a href={data.nft_url} target="_blank" rel="noreferrer" className="inline-block text-ocean-500 underline">{t('claim_see_nft')} ↗</a>
              )}
            </div>
          ) : (
            <form onSubmit={send} className="mt-4 space-y-3">
              <label className="label" htmlFor="wallet">{t('claim_wallet')}</label>
              <input id="wallet" className="input font-mono" placeholder="0x…" value={wallet}
                onChange={(e) => setWallet(e.target.value)} autoComplete="off" spellCheck={false} />
              <ErrorNote error={err} />
              <Button className="w-full" busy={busy} disabled={!/^0x[0-9a-fA-F]{40}$/.test(wallet.trim())}>{t('claim_send')}</Button>
            </form>
          )}
          <Link to={`/p/${data.board_id}`} className="mt-4 block text-sm text-ocean-500 underline">{t('passport')} {data.board_id}</Link>
        </Card>
      )}
    </main>
  )
}
