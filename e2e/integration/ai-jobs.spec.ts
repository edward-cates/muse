import { test, expect, type Page } from '@playwright/test'

test.setTimeout(60_000)

// ── Helpers ──

async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      let token = ''
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (key.includes('-auth-token')) {
          const session = JSON.parse(localStorage.getItem(key)!)
          token = session.access_token
          break
        }
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
      const res = await fetch(path, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json().catch(() => null)
      return { status: res.status, data }
    },
    { method, path, body },
  )
}

async function waitForJobStatus(
  page: Page,
  jobId: string,
  targetStatuses: string[],
  timeoutMs = 30_000,
): Promise<{ status: number; data: any }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = await apiCall(page, 'GET', `/api/jobs/${jobId}`)
    if (result.status === 200 && targetStatuses.includes(result.data.status)) {
      return result
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`Job ${jobId} did not reach status ${targetStatuses.join('|')} within ${timeoutMs}ms`)
}

// ── Tests ──

test.describe('Agent job system', () => {
  test('create job, get status, and cancel before execution', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create a document to attach the job to
    const docResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Job Test Canvas',
      type: 'canvas',
    })
    expect(docResult.status).toBe(200)
    const documentId = docResult.data.document.id

    // 1. Create a job
    const createResult = await apiCall(page, 'POST', '/api/jobs', {
      type: 'research',
      input: { message: 'test query for job system' },
      document_id: documentId,
    })
    expect(createResult.status).toBe(200)
    expect(createResult.data.jobId).toBeTruthy()
    expect(createResult.data.status).toBe('pending')

    const jobId = createResult.data.jobId

    // 2. Get job status
    const statusResult = await apiCall(page, 'GET', `/api/jobs/${jobId}`)
    expect(statusResult.status).toBe(200)
    expect(statusResult.data.id).toBe(jobId)
    expect(statusResult.data.type).toBe('research')
    expect(['pending', 'running']).toContain(statusResult.data.status)

    // 3. Cancel the job
    const cancelResult = await apiCall(page, 'POST', `/api/jobs/${jobId}/cancel`)
    expect(cancelResult.status).toBe(200)
    expect(cancelResult.data.status).toBe('cancelled')

    // 4. Verify cancelled status persists
    const afterCancel = await apiCall(page, 'GET', `/api/jobs/${jobId}`)
    expect(afterCancel.status).toBe(200)
    expect(afterCancel.data.status).toBe('cancelled')
  })

  test('rejects invalid job type', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    const result = await apiCall(page, 'POST', '/api/jobs', {
      type: 'invalid_type',
      input: { message: 'test' },
    })
    expect(result.status).toBe(400)
    expect(result.data.error).toContain('Invalid job type')
  })

  test('rejects missing input', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    const result = await apiCall(page, 'POST', '/api/jobs', {
      type: 'research',
    })
    expect(result.status).toBe(400)
    expect(result.data.error).toContain('input')
  })

  test('returns 404 for nonexistent job', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    const result = await apiCall(page, 'GET', '/api/jobs/00000000-0000-0000-0000-000000000000')
    expect(result.status).toBe(404)
  })

  test('cannot cancel already-cancelled job', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create and immediately cancel
    const docResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Cancel Test',
      type: 'canvas',
    })
    const documentId = docResult.data.document.id

    const createResult = await apiCall(page, 'POST', '/api/jobs', {
      type: 'research',
      input: { message: 'cancel test' },
      document_id: documentId,
    })
    const jobId = createResult.data.jobId
    await apiCall(page, 'POST', `/api/jobs/${jobId}/cancel`)

    // Try to cancel again
    const result = await apiCall(page, 'POST', `/api/jobs/${jobId}/cancel`)
    expect(result.status).toBe(409)
  })

  test('job transitions from pending to running when worker picks it up', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create a document
    const docResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Worker Pickup Test',
      type: 'canvas',
    })
    const documentId = docResult.data.document.id

    // Create a job — the worker should pick it up within 2-3s
    const createResult = await apiCall(page, 'POST', '/api/jobs', {
      type: 'research',
      input: { message: 'test worker pickup' },
      document_id: documentId,
    })
    const jobId = createResult.data.jobId

    // Wait for the job to reach running or a terminal state
    // (it will fail because there's no Anthropic API key, but it should at least start)
    const result = await waitForJobStatus(
      page, jobId,
      ['running', 'completed', 'failed'],
      15_000,
    )
    // The worker claimed and started the job (or it failed quickly due to missing API key)
    expect(['running', 'completed', 'failed']).toContain(result.data.status)

    // If it failed, it should have an error message
    if (result.data.status === 'failed') {
      expect(result.data.error).toBeTruthy()
    }
  })
})
