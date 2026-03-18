import type { Express } from 'express'

const SURFPOOL_RPC = 'http://localhost:8899'

// Mainnet USDC mint — Surfpool clones it from the datasource network.
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

const SOL_AMOUNT = 100_000_000_000 // 100 SOL in lamports
const USDC_AMOUNT = 100_000_000    // 100 USDC (6 decimals)

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(SURFPOOL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const data = (await res.json()) as { result?: any; error?: { message: string } }
  if (data.error) throw new Error(`${method}: ${data.error.message}`)
  return data.result
}

export function registerFaucet(
  app: Express,
  _network: string,
) {
  // Status
  app.get('/api/v1/faucet/status', (_req, res) => {
    res.json({
      solAmount: '100 SOL',
      usdcAmount: '100 USDC',
      usdcMint: USDC_MINT,
    })
  })

  // Airdrop SOL + USDC via surfpool cheatcodes
  app.post('/api/v1/faucet/airdrop', async (req, res) => {
    const { address } = req.body
    if (!address) {
      return res.status(400).json({ error: 'Missing address in request body' })
    }

    try {
      // 1. Set SOL balance via surfnet_setAccount
      await rpcCall('surfnet_setAccount', [
        address,
        {
          lamports: SOL_AMOUNT,
          data: '',
          executable: false,
          owner: '11111111111111111111111111111111',
          rentEpoch: 0,
        },
      ])

      // 2. Set USDC token balance via surfnet_setTokenAccount
      await rpcCall('surfnet_setTokenAccount', [
        address,
        USDC_MINT,
        {
          amount: USDC_AMOUNT,
          state: 'initialized',
        },
        TOKEN_PROGRAM,
      ])

      res.json({
        ok: true,
        sol: '100 SOL',
        usdc: '100 USDC',
      })
    } catch (err: any) {
      res.status(500).json({
        error: 'Airdrop failed',
        details: err?.message ?? String(err),
      })
    }
  })
}
