import { useState, useCallback, type DragEvent } from 'react'
import {
  generateWallet,
  saveSecretKey,
  getSigner,
  requestAirdrop,
  importKeypairJson,
} from '../wallet.js'

type Props = {
  onReady: () => void
}

type Screen = 'start' | 'generated' | 'importing'

export default function WalletSetup({ onReady }: Props) {
  const [screen, setScreen] = useState<Screen>('start')
  const [address, setAddress] = useState('')
  const [importKey, setImportKey] = useState('')
  const [error, setError] = useState('')
  const [airdropping, setAirdropping] = useState(false)
  const [airdropped, setAirdropped] = useState(false)
  const [dragging, setDragging] = useState(false)

  const handleGenerate = async () => {
    try {
      const signer = await generateWallet()
      setAddress(signer.address)
      setScreen('generated')
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleImport = async () => {
    try {
      setError('')
      saveSecretKey(importKey.trim())
      const signer = await getSigner()
      setAddress(signer.address)
      onReady()
    } catch (err: any) {
      setError('Invalid secret key: ' + err.message)
    }
  }

  const handleAirdrop = async () => {
    setAirdropping(true)
    try {
      await requestAirdrop()
      setAirdropped(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAirdropping(false)
    }
  }

  const handleFile = useCallback(async (file: File) => {
    try {
      setError('')
      const text = await file.text()
      const signer = await importKeypairJson(text)
      setAddress(signer.address)
      setScreen('generated')
    } catch (err: any) {
      setError('Failed to import keypair: ' + err.message)
    }
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const s = styles

  if (screen === 'generated') {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={s.heading}>Wallet Ready</h2>
          <div style={s.field}>
            <label style={s.label}>Address</label>
            <div style={s.mono}>{address}</div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button
              style={airdropped ? s.btnDim : s.btn}
              onClick={handleAirdrop}
              disabled={airdropping || airdropped}
            >
              {airdropping ? 'Requesting...' : airdropped ? 'Funded!' : 'Airdrop 100 SOL + 100 USDC'}
            </button>
            <button style={s.btnPrimary} onClick={onReady}>
              Enter Playground
            </button>
          </div>
          {error && <div style={s.error}>{error}</div>}
        </div>
      </div>
    )
  }

  if (screen === 'importing') {
    return (
      <div style={s.container}>
        <div style={s.card}>
          <h2 style={s.heading}>Import Wallet</h2>
          <p style={s.sub}>Paste your base58-encoded secret key (64-byte keypair).</p>
          <textarea
            style={s.textarea}
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            placeholder="Paste secret key..."
            rows={3}
          />
          {error && <div style={s.error}>{error}</div>}
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button style={s.btn} onClick={() => setScreen('start')}>Back</button>
            <button style={s.btnPrimary} onClick={handleImport} disabled={!importKey.trim()}>
              Import
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={s.container}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <div style={{
        ...s.card,
        ...(dragging ? { borderColor: '#9945FF', boxShadow: '0 0 20px #9945FF33' } : {}),
      }}>
        <h2 style={s.heading}>Setup Wallet</h2>
        <p style={s.sub}>
          Generate a new Solana keypair for the demo, or import an existing one.
          This runs on <strong>devnet</strong> &mdash; no real funds needed.
        </p>

        {/* Drop zone */}
        <div
          style={{
            ...s.dropZone,
            ...(dragging ? { borderColor: '#9945FF', background: '#9945FF11' } : {}),
          }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>{dragging ? '\u2193' : '\u{1F4C4}'}</div>
          <div style={{ color: '#888', fontSize: 12 }}>
            {dragging ? 'Drop keypair file here' : 'Drop a Solana keypair JSON file here'}
          </div>
          <label style={s.browseLabel}>
            or browse
            <input
              type="file"
              accept=".json"
              onChange={handleFileInput}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button style={s.btnPrimary} onClick={handleGenerate}>
            Generate New Wallet
          </button>
          <button style={s.btn} onClick={() => setScreen('importing')}>
            Paste Secret Key
          </button>
        </div>
        {error && <div style={s.error}>{error}</div>}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 20,
  },
  card: {
    background: '#111',
    border: '1px solid #222',
    borderRadius: 12,
    padding: 32,
    maxWidth: 520,
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 8,
  },
  sub: {
    fontSize: 13,
    color: '#888',
    lineHeight: 1.5,
  },
  label: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
    display: 'block',
  },
  field: {
    marginTop: 16,
    padding: 12,
    background: '#0A0A0A',
    borderRadius: 8,
    border: '1px solid #222',
  },
  mono: {
    fontSize: 12,
    color: '#14F195',
    wordBreak: 'break-all' as const,
  },
  dropZone: {
    marginTop: 20,
    padding: 24,
    border: '2px dashed #333',
    borderRadius: 10,
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
  },
  browseLabel: {
    display: 'inline-block',
    marginTop: 8,
    color: '#9945FF',
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  textarea: {
    width: '100%',
    marginTop: 12,
    padding: 12,
    background: '#0A0A0A',
    border: '1px solid #222',
    borderRadius: 8,
    color: '#E0E0E0',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 12,
    resize: 'vertical' as const,
    outline: 'none',
  },
  btn: {
    padding: '10px 20px',
    background: '#1A1A1A',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#E0E0E0',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    cursor: 'pointer',
  },
  btnDim: {
    padding: '10px 20px',
    background: '#1A1A1A',
    border: '1px solid #222',
    borderRadius: 8,
    color: '#666',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    cursor: 'default',
  },
  btnPrimary: {
    padding: '10px 20px',
    background: '#9945FF',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    marginTop: 12,
    padding: 8,
    background: '#2a0a0a',
    border: '1px solid #500',
    borderRadius: 6,
    color: '#f88',
    fontSize: 12,
  },
}
