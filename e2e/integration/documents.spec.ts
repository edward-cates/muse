import { test, expect, type Page } from '@playwright/test'

test.setTimeout(60_000)

// ── Helpers ──

function getDocumentId(url: string): string {
  const match = url.match(/#\/d\/(.+)/)
  if (!match) throw new Error(`No document ID in URL: ${url}`)
  return match[1]
}

/** Get an auth token from localStorage (Supabase session). */
async function getToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!
      if (key.includes('-auth-token')) {
        const session = JSON.parse(localStorage.getItem(key)!)
        return session.access_token as string
      }
    }
    throw new Error('No auth session in localStorage')
  })
}

/** Make authenticated API call from the browser context. */
async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
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

// ── Tests ──

test.describe('Documents API (real DB)', () => {
  test('creating a canvas document via navigation registers it in the DB', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const docId = getDocumentId(page.url())

    // Wait for registration POST to complete
    await page.waitForTimeout(1500)

    // Query the API for this document
    const result = await apiCall(page, 'GET', '/api/documents')
    const docs = (result.data as { documents: Array<{ id: string; type: string }> }).documents
    const thisDoc = docs.find(d => d.id === docId)

    expect(thisDoc).toBeTruthy()
    expect(thisDoc!.type).toBe('canvas')
  })

  test('document list shows created documents', async ({ page }) => {
    // Create Doc 1
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const doc1Id = getDocumentId(page.url())
    await page.waitForTimeout(1500)

    // Create Doc 2
    await page.goto('about:blank')
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const doc2Id = getDocumentId(page.url())
    await page.waitForTimeout(1500)

    // Query the API
    const result = await apiCall(page, 'GET', '/api/documents')
    const docs = (result.data as { documents: Array<{ id: string }> }).documents
    const ids = docs.map(d => d.id)

    expect(ids).toContain(doc1Id)
    expect(ids).toContain(doc2Id)
  })

  test('creating an HTML artifact via API and navigating to it shows the viewer', async ({ page }) => {
    // First navigate to get auth session loaded
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create an HTML artifact via API
    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Test Widget',
      type: 'html_artifact',
    })
    expect(createResult.status).toBe(200)
    const doc = (createResult.data as { document: { id: string; type: string; title: string } }).document
    expect(doc.type).toBe('html_artifact')
    expect(doc.title).toBe('Test Widget')

    // Save content
    const html = '<html><body><h1>Hello from test</h1></body></html>'
    const contentResult = await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, { content: html })
    expect(contentResult.status).toBe(200)
    expect((contentResult.data as { content_version: number }).content_version).toBe(1)

    // Navigate to it
    await page.goto(`/#/d/${doc.id}`)

    // Should see the HTML artifact viewer (no canvas)
    await expect(page.locator('[data-testid="canvas"]')).toHaveCount(0, { timeout: 10_000 })
    // Should see the iframe with the content
    await expect(page.locator('iframe[title="HTML Artifact"]')).toBeVisible({ timeout: 10_000 })
  })

  test('document content API: save, retrieve, version bumps', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create document
    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Content Test',
      type: 'html_artifact',
    })
    const doc = (createResult.data as { document: { id: string } }).document

    // Initially no content
    const get1 = await apiCall(page, 'GET', `/api/documents/${doc.id}/content`)
    expect(get1.status).toBe(200)
    expect((get1.data as { content: string | null }).content).toBeFalsy()
    expect((get1.data as { content_version: number }).content_version).toBe(0)

    // Save content v1
    const patch1 = await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, {
      content: '<p>Version 1</p>',
    })
    expect((patch1.data as { content_version: number }).content_version).toBe(1)

    // Save content v2
    const patch2 = await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, {
      content: '<p>Version 2</p>',
    })
    expect((patch2.data as { content_version: number }).content_version).toBe(2)

    // Retrieve — should be v2
    const get2 = await apiCall(page, 'GET', `/api/documents/${doc.id}/content`)
    expect((get2.data as { content: string }).content).toBe('<p>Version 2</p>')
    expect((get2.data as { content_version: number }).content_version).toBe(2)
  })

  test('type filter returns only matching documents', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create one canvas and one HTML artifact
    await apiCall(page, 'POST', '/api/documents', { title: 'A Canvas', type: 'canvas' })
    await apiCall(page, 'POST', '/api/documents', { title: 'An Artifact', type: 'html_artifact' })

    // Filter by type
    const canvasResult = await apiCall(page, 'GET', '/api/documents?type=canvas')
    const canvasDocs = (canvasResult.data as { documents: Array<{ type: string }> }).documents
    expect(canvasDocs.every(d => d.type === 'canvas')).toBe(true)

    const artifactResult = await apiCall(page, 'GET', '/api/documents?type=html_artifact')
    const artifactDocs = (artifactResult.data as { documents: Array<{ type: string }> }).documents
    expect(artifactDocs.length).toBeGreaterThanOrEqual(1)
    expect(artifactDocs.every(d => d.type === 'html_artifact')).toBe(true)
  })

  test('renaming a document persists across navigation', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const docId = getDocumentId(page.url())
    await page.waitForTimeout(1500)

    // Rename
    const patchDone = page.waitForResponse(
      (resp) => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH',
    )
    await page.locator('.drawing-title__display').click()
    await page.locator('.drawing-title__input').fill('My Renamed Doc')
    await page.locator('.drawing-title__input').press('Enter')
    await patchDone

    // Navigate away and back
    await page.goto('about:blank')
    await page.goto(`/#/d/${docId}`)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

    await expect(page.locator('.drawing-title__display')).toHaveText('My Renamed Doc', { timeout: 10_000 })
  })

  test('deleting a document removes it from the list', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create a document to delete
    const createResult = await apiCall(page, 'POST', '/api/documents', { title: 'To Delete' })
    const doc = (createResult.data as { document: { id: string } }).document

    // Verify it exists
    let list = await apiCall(page, 'GET', '/api/documents')
    let ids = (list.data as { documents: Array<{ id: string }> }).documents.map(d => d.id)
    expect(ids).toContain(doc.id)

    // Delete it
    const delResult = await apiCall(page, 'DELETE', `/api/documents/${doc.id}`)
    expect(delResult.status).toBe(200)

    // Verify it's gone
    list = await apiCall(page, 'GET', '/api/documents')
    ids = (list.data as { documents: Array<{ id: string }> }).documents.map(d => d.id)
    expect(ids).not.toContain(doc.id)
  })

  test('content endpoint returns 404 for nonexistent document', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1000)

    const result = await apiCall(page, 'GET', '/api/documents/00000000-0000-0000-0000-000000000000/content')
    expect(result.status).toBe(404)
  })

  test('parent_id links artifact to canvas', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const canvasId = getDocumentId(page.url())
    await page.waitForTimeout(1500)

    // Create an artifact with parent_id pointing to the canvas
    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Child Artifact',
      type: 'html_artifact',
      parent_id: canvasId,
    })
    const doc = (createResult.data as { document: { id: string; parent_id: string } }).document
    expect(doc.parent_id).toBe(canvasId)

    // Save some content
    await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, {
      content: '<h1>Child</h1>',
    })

    // Navigate to the artifact
    await page.goto(`/#/d/${doc.id}`)
    await expect(page.locator('iframe[title="HTML Artifact"]')).toBeVisible({ timeout: 10_000 })

    // Should show a "Back" button since it has a parent
    await expect(page.locator('button:has-text("Back")')).toBeVisible({ timeout: 10_000 })

    // Click back — should navigate to the parent canvas
    await page.locator('button:has-text("Back")').click()
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    expect(getDocumentId(page.url())).toBe(canvasId)
  })

  test('HTML artifact viewer renders content in iframe', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create artifact with rich HTML
    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Render Test',
      type: 'html_artifact',
    })
    const doc = (createResult.data as { document: { id: string } }).document

    const html = `<!DOCTYPE html>
<html>
<head><style>body { font-family: sans-serif; } h1 { color: blue; }</style></head>
<body><h1 id="test-heading">Render Test Heading</h1><p>Content renders correctly.</p></body>
</html>`

    await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, { content: html })

    // Navigate to it
    await page.goto(`/#/d/${doc.id}`)
    const iframe = page.locator('iframe[title="HTML Artifact"]')
    await expect(iframe).toBeVisible({ timeout: 10_000 })

    // Check iframe content
    const frame = page.frameLocator('iframe[title="HTML Artifact"]')
    await expect(frame.locator('#test-heading')).toHaveText('Render Test Heading', { timeout: 10_000 })
  })

  test('backward compat: /api/drawings alias still works', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // The old /api/drawings route should still respond
    const result = await apiCall(page, 'GET', '/api/drawings')
    expect(result.status).toBe(200)
    expect((result.data as { documents: unknown[] }).documents).toBeDefined()
  })
})
