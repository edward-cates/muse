import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import * as jose from 'jose'

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440000'

// ── Mock Supabase ──

interface MockRow {
  [key: string]: unknown
}

let jobStore: MockRow[] = []
let jobCounter = 0

function createMockSupabase(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/)
      const table = pathMatch?.[1] || ''
      const method = req.method || 'GET'

      let body = ''
      for await (const chunk of req) body += chunk

      // JWKS endpoint
      if (url.pathname.includes('.well-known/jwks.json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ keys: [] }))
        return
      }

      if (table === 'agent_jobs') {
        const prefer = req.headers['prefer'] as string || ''
        const isReturnRep = prefer.includes('return=representation')

        if (method === 'POST') {
          const parsed = JSON.parse(body)
          const job = {
            id: `job-${++jobCounter}`,
            document_id: parsed.document_id || null,
            user_id: parsed.user_id,
            type: parsed.type,
            status: parsed.status || 'pending',
            input: parsed.input || {},
            progress: parsed.progress || {},
            result: parsed.result || null,
            error: parsed.error || null,
            attempts: parsed.attempts || 0,
            max_attempts: parsed.max_attempts || 3,
            locked_by: parsed.locked_by || null,
            locked_at: parsed.locked_at || null,
            started_at: parsed.started_at || null,
            completed_at: parsed.completed_at || null,
            created_at: new Date().toISOString(),
            updated_at: parsed.updated_at || new Date().toISOString(),
          }
          jobStore.push(job)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(job))
          return
        }

        if (method === 'GET') {
          // Parse query filters
          let results = [...jobStore]
          const idFilter = url.searchParams.get('id')
          const statusFilter = url.searchParams.get('status')
          const userFilter = url.searchParams.get('user_id')

          if (idFilter) {
            const val = idFilter.replace('eq.', '')
            results = results.filter(j => j.id === val)
          }
          if (statusFilter) {
            if (statusFilter.startsWith('eq.')) {
              results = results.filter(j => j.status === statusFilter.replace('eq.', ''))
            } else if (statusFilter.startsWith('in.')) {
              const vals = statusFilter.replace('in.(', '').replace(')', '').split(',').map(s => s.replace(/"/g, ''))
              results = results.filter(j => vals.includes(j.status as string))
            }
          }
          if (userFilter) {
            const val = userFilter.replace('eq.', '')
            results = results.filter(j => j.user_id === val)
          }

          // Handle limit
          const limit = url.searchParams.get('limit')
          if (limit) results = results.slice(0, Number(limit))

          // Single vs array
          if (req.headers['accept']?.includes('vnd.pgrst.object+json')) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results[0] || null))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results))
          }
          return
        }

        if (method === 'PATCH') {
          const updates = JSON.parse(body)
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          const statusFilter = url.searchParams.get('status')

          let matched: MockRow | undefined
          for (const job of jobStore) {
            if (idFilter && job.id !== idFilter) continue
            if (statusFilter) {
              if (statusFilter.startsWith('eq.') && job.status !== statusFilter.replace('eq.', '')) continue
              if (statusFilter.startsWith('in.')) {
                const vals = statusFilter.replace('in.(', '').replace(')', '').split(',').map(s => s.replace(/"/g, ''))
                if (!vals.includes(job.status as string)) continue
              }
            }
            Object.assign(job, updates)
            matched = job
            break
          }

          if (isReturnRep) {
            if (req.headers['accept']?.includes('vnd.pgrst.object+json')) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(matched || null))
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(matched ? [matched] : []))
            }
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(null))
          }
          return
        }
      }

      // Default for unknown tables
      if (table === 'user_secrets') {
        // Return no secret by default (tests can override jobStore)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(null))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(null))
    })

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

async function signToken(sub: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({ sub, role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

// ── Tests ──

describe('Jobs API', () => {
  let appServer: Server
  let appPort: number
  let mockSb: { server: Server; url: string }
  let token: string
  let otherToken: string

  before(async () => {
    mockSb = await createMockSupabase()
    process.env.SUPABASE_URL = mockSb.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)

    const { createApp } = await import('../src/app.js')
    const { server } = await createApp()
    appServer = server
    await new Promise<void>((resolve) => appServer.listen(0, resolve))
    appPort = (appServer.address() as AddressInfo).port

    token = await signToken(TEST_USER_ID)
    otherToken = await signToken(OTHER_USER_ID)
  })

  after(async () => {
    appServer?.close()
    mockSb?.server.close()
  })

  beforeEach(() => {
    jobStore = []
    jobCounter = 0
  })

  // ── POST /api/jobs ──

  it('creates a job and returns jobId', async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research', input: { message: 'test query' } }),
    })
    assert.equal(res.status, 200)
    const data = await res.json() as { jobId: string; status: string }
    assert.ok(data.jobId)
    assert.equal(data.status, 'pending')
  })

  it('rejects missing type', async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: { message: 'test' } }),
    })
    assert.equal(res.status, 400)
  })

  it('rejects invalid job type', async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'invalid_type', input: {} }),
    })
    assert.equal(res.status, 400)
  })

  it('rejects missing input', async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research' }),
    })
    assert.equal(res.status, 400)
  })

  it('requires auth', async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'research', input: {} }),
    })
    assert.equal(res.status, 401)
  })

  // ── GET /api/jobs/:id ──

  it('returns job status', async () => {
    // Create a job first
    const createRes = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research', input: { message: 'test' } }),
    })
    const { jobId } = await createRes.json() as { jobId: string }

    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 200)
    const data = await res.json() as { id: string; status: string; type: string }
    assert.equal(data.id, jobId)
    assert.equal(data.status, 'pending')
    assert.equal(data.type, 'research')
  })

  it('returns 404 for nonexistent job', async () => {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs/nonexistent-id`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 404)
  })

  it('returns 404 for another user\'s job', async () => {
    // Create job as TEST_USER
    const createRes = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research', input: { message: 'test' } }),
    })
    const { jobId } = await createRes.json() as { jobId: string }

    // Try to read as OTHER_USER
    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    })
    assert.equal(res.status, 404)
  })

  // ── POST /api/jobs/:id/cancel ──

  it('cancels a pending job', async () => {
    const createRes = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research', input: { message: 'test' } }),
    })
    const { jobId } = await createRes.json() as { jobId: string }

    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 200)
    const data = await res.json() as { success: boolean; status: string }
    assert.ok(data.success)
    assert.equal(data.status, 'cancelled')
  })

  it('returns 409 when cancelling a completed job', async () => {
    // Create and manually mark as completed
    const createRes = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research', input: { message: 'test' } }),
    })
    const { jobId } = await createRes.json() as { jobId: string }

    // Manually mark completed in the mock store
    const job = jobStore.find(j => j.id === jobId)
    if (job) job.status = 'completed'

    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    assert.equal(res.status, 409)
  })

  it('returns 404 when cancelling another user\'s job', async () => {
    const createRes = await fetch(`http://127.0.0.1:${appPort}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'research', input: { message: 'test' } }),
    })
    const { jobId } = await createRes.json() as { jobId: string }

    const res = await fetch(`http://127.0.0.1:${appPort}/api/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherToken}` },
    })
    assert.equal(res.status, 404)
  })
})
