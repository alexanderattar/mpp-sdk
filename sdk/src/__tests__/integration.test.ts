/**
 * Integration tests against a local Surfpool simnet.
 *
 * Runs a real HTTP server (mppx server) and a real HTTP client (mppx client)
 * with actual Solana transactions against surfpool on localhost:8899.
 *
 * Requires: `surfpool start --no-tui --offline` running on localhost:8899
 *
 * Run: npm run test:integration
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { generateKeyPairSigner } from '@solana/kit'
import { Mppx as ServerMppx, solana as serverSolana, Store } from '../../src/server/index.js'
import { Mppx as ClientMppx, solana as clientSolana } from '../../src/client/index.js'

const RPC_URL = 'http://localhost:8899'

// ── Helpers ──

async function airdrop(pubkey: string, lamports: number) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'requestAirdrop',
      params: [pubkey, lamports],
    }),
  })
  const data = (await res.json()) as { result?: string; error?: any }
  if (data.error) throw new Error(`Airdrop failed: ${JSON.stringify(data.error)}`)

  // Wait for confirmation
  const sig = data.result!
  for (let i = 0; i < 30; i++) {
    const statusRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[sig]],
      }),
    })
    const statusData = (await statusRes.json()) as { result?: { value: any[] } }
    const status = statusData.result?.value?.[0]
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return sig
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Airdrop confirmation timeout')
}

async function getBalance(pubkey: string): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [pubkey],
    }),
  })
  const data = (await res.json()) as { result?: { value: number } }
  return data.result?.value ?? 0
}

async function isSurfpoolRunning(): Promise<boolean> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Convert an incoming Node request to a Web API Request. */
function toWebRequest(req: http.IncomingMessage, body: string): Request {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value)
  }
  const url = `http://localhost${req.url}`
  return new Request(url, { method: req.method, headers, body: body || undefined })
}

// ── Test state ──

let clientSigner: Awaited<ReturnType<typeof generateKeyPairSigner>>
let recipientSigner: Awaited<ReturnType<typeof generateKeyPairSigner>>
let server: http.Server
let serverPort: number

before(async () => {
  const running = await isSurfpoolRunning()
  if (!running) {
    console.log('Surfpool not running on localhost:8899 — skipping integration tests.')
    console.log('Start it with: surfpool start --no-tui --offline')
    process.exit(0)
  }

  // Generate fresh keypairs
  clientSigner = await generateKeyPairSigner()
  recipientSigner = await generateKeyPairSigner()

  // Fund the client with 10 SOL
  await airdrop(clientSigner.address, 10_000_000_000)

  // Start a test HTTP server with the mppx charge handler
  // secretKey is required by mppx for signing challenge tokens
  const secretKey = 'test-secret-key-for-integration-tests'

  const mppx = ServerMppx.create({
    secretKey,
    methods: [
      serverSolana.charge({
        recipient: recipientSigner.address,
        network: 'localnet',
        rpcUrl: RPC_URL,
      }),
    ],
  })

  server = http.createServer(async (req, res) => {
    // Read body
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString()

    const webReq = toWebRequest(req, body)

    const result = await mppx.charge({
      amount: '1000000', // 0.001 SOL
      currency: 'SOL',
      description: 'test charge',
    })(webReq)

    if (result.status === 402) {
      const challenge = result.challenge as Response
      const headers = Object.fromEntries(challenge.headers)
      res.writeHead(challenge.status, headers)
      res.end(await challenge.text())
      return
    }

    const response = result.withReceipt(
      Response.json({ paid: true }),
    ) as Response
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(await response.text())
  })

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      serverPort = (server.address() as any).port
      resolve()
    })
  })
})

after(() => {
  server?.close()
})

// ── Tests ──

test('e2e: native SOL charge via server-broadcast (default)', async () => {
  const events: string[] = []

  const clientMethod = clientSolana.charge({
    signer: clientSigner,
    rpcUrl: RPC_URL,
    // broadcast defaults to false (server-broadcast)
    onProgress(event) {
      events.push(event.type)
    },
  })

  const mppx = ClientMppx.create({ methods: [clientMethod] })

  const balanceBefore = await getBalance(recipientSigner.address)

  const response = await mppx.fetch(`http://localhost:${serverPort}/test`)
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(data, { paid: true })

  // Verify progress events
  assert.ok(events.includes('challenge'), 'should emit challenge')
  assert.ok(events.includes('signing'), 'should emit signing')
  assert.ok(events.includes('signed'), 'should emit signed')

  // Verify recipient received payment
  const balanceAfter = await getBalance(recipientSigner.address)
  assert.ok(balanceAfter > balanceBefore, 'recipient balance should increase')
  assert.ok(
    balanceAfter - balanceBefore >= 1_000_000,
    `expected >= 1000000 lamports increase, got ${balanceAfter - balanceBefore}`,
  )
})

test('e2e: native SOL charge via client-broadcast', async () => {
  const events: string[] = []

  const clientMethod = clientSolana.charge({
    signer: clientSigner,
    rpcUrl: RPC_URL,
    broadcast: true,
    onProgress(event) {
      events.push(event.type)
    },
  })

  const mppx = ClientMppx.create({ methods: [clientMethod] })

  const response = await mppx.fetch(`http://localhost:${serverPort}/test`)
  const data = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(data, { paid: true })

  // Client-broadcast should fire: challenge → signing → paying → confirming → paid
  assert.ok(events.includes('challenge'), 'should emit challenge')
  assert.ok(events.includes('signing'), 'should emit signing')
  assert.ok(events.includes('paying'), 'should emit paying')
  assert.ok(events.includes('paid'), 'should emit paid')
})

test('e2e: multiple sequential charges succeed', async () => {
  const clientMethod = clientSolana.charge({
    signer: clientSigner,
    rpcUrl: RPC_URL,
  })

  const mppx = ClientMppx.create({ methods: [clientMethod] })

  // Three sequential charges should all succeed (no replay issues)
  for (let i = 0; i < 3; i++) {
    const response = await mppx.fetch(`http://localhost:${serverPort}/test`)
    assert.equal(response.status, 200, `request ${i + 1} should succeed`)
    const data = await response.json()
    assert.deepEqual(data, { paid: true })
  }
})

test('e2e: receipt header is present on success', async () => {
  const clientMethod = clientSolana.charge({
    signer: clientSigner,
    rpcUrl: RPC_URL,
  })

  const mppx = ClientMppx.create({ methods: [clientMethod] })

  const response = await mppx.fetch(`http://localhost:${serverPort}/test`)
  assert.equal(response.status, 200)

  // mppx attaches a receipt header
  const receiptHeader = response.headers.get('Payment-Receipt')
  assert.ok(receiptHeader, 'response should have Payment-Receipt header')
})

// ── Fee payer (server pays tx fees) ──

test('e2e: fee payer mode — server co-signs and pays fees', async () => {
  // Generate a dedicated fee payer keypair for the server
  const feePayerSigner = await generateKeyPairSigner()
  await airdrop(feePayerSigner.address, 10_000_000_000) // Fund fee payer

  const secretKey = 'test-secret-key-feepayer'

  const feePayerMppx = ServerMppx.create({
    secretKey,
    methods: [
      serverSolana.charge({
        recipient: recipientSigner.address,
        network: 'localnet',
        rpcUrl: RPC_URL,
        signer: feePayerSigner, // Server pays fees
      }),
    ],
  })

  // Start a fee-payer server
  const fpServer = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString()
    const webReq = toWebRequest(req, body)

    const result = await feePayerMppx.charge({
      amount: '1000000',
      currency: 'SOL',
    })(webReq)

    if (result.status === 402) {
      const challenge = result.challenge as Response
      res.writeHead(challenge.status, Object.fromEntries(challenge.headers))
      res.end(await challenge.text())
      return
    }

    const response = result.withReceipt(Response.json({ paid: true })) as Response
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(await response.text())
  })

  const fpPort = await new Promise<number>((resolve) => {
    fpServer.listen(0, () => resolve((fpServer.address() as any).port))
  })

  try {
    const clientBalanceBefore = await getBalance(clientSigner.address)

    const clientMethod = clientSolana.charge({
      signer: clientSigner,
      rpcUrl: RPC_URL,
      // broadcast defaults to false — required for fee payer
    })

    const mppx = ClientMppx.create({ methods: [clientMethod] })
    const response = await mppx.fetch(`http://localhost:${fpPort}/test`)
    const data = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(data, { paid: true })

    // Client should have paid exactly 1_000_000 lamports for the transfer,
    // but NOT the tx fee (the fee payer covered that).
    const clientBalanceAfter = await getBalance(clientSigner.address)
    const clientSpent = clientBalanceBefore - clientBalanceAfter

    // The client should have spent exactly the transfer amount (1_000_000 lamports).
    // Without fee payer, they'd also spend ~5000 lamports for the tx fee.
    assert.equal(
      clientSpent,
      1_000_000,
      `client should spend exactly 1000000 lamports (transfer only), got ${clientSpent}`,
    )
  } finally {
    fpServer.close()
  }
})
