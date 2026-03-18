import { useState, useEffect } from 'react'
import { getBalances, clearWallet, loadSecretKey, getSigner, type Balances } from '../wallet.js'

type Props = {
  onClose: () => void
  onReset: () => void
}

export default function WalletModal({ onClose, onReset }: Props) {
  const [address, setAddress] = useState('')
  const [balances, setBalances] = useState<Balances | null>(null)
  const [feePayerSol, setFeePayerSol] = useState<number | null>(null)

  useEffect(() => {
    getSigner().then((s) => setAddress(s.address))
    getBalances().then(setBalances).catch(() => {})

    // Fetch fee payer balance from the server
    fetch('/api/v1/health')
      .then((r) => r.json())
      .then((data: any) => {
        if (data.feePayerBalance !== undefined) {
          setFeePayerSol(data.feePayerBalance)
        }
      })
      .catch(() => {})
  }, [])

  const handleReset = () => {
    clearWallet()
    onReset()
  }

  const copyAddress = () => navigator.clipboard.writeText(address)
  const copyKey = () => {
    const key = loadSecretKey()
    if (key) navigator.clipboard.writeText(key)
  }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={s.heading}>Wallet</h3>

        <div style={s.field}>
          <div style={s.row}>
            <label style={s.label}>Address</label>
            <button style={s.copyBtn} onClick={copyAddress}>copy</button>
          </div>
          <div style={s.mono}>{address}</div>
        </div>

        <div style={s.field}>
          <label style={s.label}>Balances</label>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <div>
              <div style={{ color: '#14F195', fontSize: 16, fontWeight: 600 }}>
                {balances !== null ? `${balances.usdc.toFixed(2)}` : '...'}
              </div>
              <div style={{ color: '#666', fontSize: 10 }}>USDC</div>
            </div>
            <div>
              <div style={{ color: '#888', fontSize: 16, fontWeight: 600 }}>
                {balances !== null ? `${balances.sol.toFixed(4)}` : '...'}
              </div>
              <div style={{ color: '#666', fontSize: 10 }}>SOL</div>
            </div>
          </div>
        </div>

        {feePayerSol !== null && (
          <div style={s.field}>
            <label style={s.label}>Fee Payer (server)</label>
            <div style={{ color: '#9945FF', fontSize: 14, fontWeight: 600 }}>
              {feePayerSol.toFixed(4)} SOL
            </div>
            <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
              Server pays transaction fees on your behalf
            </div>
          </div>
        )}

        <div style={s.field}>
          <div style={s.row}>
            <label style={s.label}>Secret Key</label>
            <button style={s.copyBtn} onClick={copyKey}>copy</button>
          </div>
          <div style={{ color: '#666', fontSize: 11 }}>
            Base58-encoded keypair (keep secret)
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button style={s.btn} onClick={onClose}>Close</button>
          <button style={s.btnDanger} onClick={handleReset}>Reset Wallet</button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    background: '#111',
    border: '1px solid #222',
    borderRadius: 12,
    padding: 24,
    maxWidth: 440,
    width: '100%',
  },
  heading: { fontSize: 16, color: '#fff', marginBottom: 16 },
  field: {
    padding: 12,
    background: '#0A0A0A',
    borderRadius: 8,
    border: '1px solid #222',
    marginBottom: 12,
  },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 10, color: '#666', textTransform: 'uppercase' as const, letterSpacing: 1 },
  mono: { fontSize: 11, color: '#14F195', wordBreak: 'break-all' as const, marginTop: 4 },
  copyBtn: {
    background: 'none',
    border: 'none',
    color: '#9945FF',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 10,
    cursor: 'pointer',
  },
  btn: {
    flex: 1,
    padding: '10px 16px',
    background: '#1A1A1A',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#E0E0E0',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnDanger: {
    flex: 1,
    padding: '10px 16px',
    background: '#2a0a0a',
    border: '1px solid #500',
    borderRadius: 8,
    color: '#f88',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    cursor: 'pointer',
  },
}
