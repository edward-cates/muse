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

  test('creating a markdown document via API and navigating to it shows the viewer', async ({ page }) => {
    // First navigate to get auth session loaded
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create a markdown document via API
    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Test Markdown',
      type: 'markdown',
    })
    expect(createResult.status).toBe(200)
    const doc = (createResult.data as { document: { id: string; type: string; title: string } }).document
    expect(doc.type).toBe('markdown')
    expect(doc.title).toBe('Test Markdown')

    // Save content
    const md = '# Hello World\n\nThis is a **markdown** document.'
    const contentResult = await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, { content: md })
    expect(contentResult.status).toBe(200)
    expect((contentResult.data as { content_version: number }).content_version).toBe(1)

    // Navigate to it
    await page.goto(`/#/d/${doc.id}`)

    // Should see the markdown viewer (no canvas, no iframe)
    await expect(page.locator('[data-testid="canvas"]')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('iframe[title="HTML Artifact"]')).toHaveCount(0)
    // Should render the markdown content
    await expect(page.locator('[data-testid="markdown-content"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="markdown-content"] h1')).toHaveText('Hello World', { timeout: 10_000 })
  })

  test('markdown document content: save, retrieve, version bumps', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create markdown document
    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'MD Content Test',
      type: 'markdown',
    })
    const doc = (createResult.data as { document: { id: string } }).document

    // Initially no content
    const get1 = await apiCall(page, 'GET', `/api/documents/${doc.id}/content`)
    expect(get1.status).toBe(200)
    expect((get1.data as { content: string | null }).content).toBeFalsy()
    expect((get1.data as { content_version: number }).content_version).toBe(0)

    // Save content v1
    const patch1 = await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, {
      content: '# Version 1',
    })
    expect((patch1.data as { content_version: number }).content_version).toBe(1)

    // Save content v2
    const patch2 = await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, {
      content: '# Version 2\n\nUpdated content.',
    })
    expect((patch2.data as { content_version: number }).content_version).toBe(2)

    // Retrieve — should be v2
    const get2 = await apiCall(page, 'GET', `/api/documents/${doc.id}/content`)
    expect((get2.data as { content: string }).content).toBe('# Version 2\n\nUpdated content.')
    expect((get2.data as { content_version: number }).content_version).toBe(2)
  })

  test('markdown viewer renders headings, bold, and lists', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    const createResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Rich Markdown',
      type: 'markdown',
    })
    const doc = (createResult.data as { document: { id: string } }).document

    const md = `# Main Heading

## Sub Heading

This has **bold** and *italic* text.

- Item one
- Item two
- Item three

\`\`\`js
const x = 42
\`\`\`
`
    await apiCall(page, 'PATCH', `/api/documents/${doc.id}/content`, { content: md })

    await page.goto(`/#/d/${doc.id}`)
    const viewer = page.locator('[data-testid="markdown-content"]')
    await expect(viewer).toBeVisible({ timeout: 10_000 })

    await expect(viewer.locator('h1')).toHaveText('Main Heading')
    await expect(viewer.locator('h2')).toHaveText('Sub Heading')
    await expect(viewer.locator('strong')).toHaveText('bold')
    await expect(viewer.locator('em')).toHaveText('italic')
    await expect(viewer.locator('li')).toHaveCount(3)
    await expect(viewer.locator('pre code')).toContainText('const x = 42')
  })

  test('type filter returns markdown documents', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    await apiCall(page, 'POST', '/api/documents', { title: 'A Markdown Doc', type: 'markdown' })

    const result = await apiCall(page, 'GET', '/api/documents?type=markdown')
    const docs = (result.data as { documents: Array<{ type: string }> }).documents
    expect(docs.length).toBeGreaterThanOrEqual(1)
    expect(docs.every(d => d.type === 'markdown')).toBe(true)
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

  test('renaming a child document updates its card title on the parent canvas', async ({ page }) => {
    // 1. Create a node in a canvas
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const parentDocId = getDocumentId(page.url())
    await page.waitForTimeout(1500)

    // Click Insert Node → pick "Create new"
    await page.locator('[data-testid="insert-node"]').click()
    await page.locator('[data-testid="node-picker-new"]').click()
    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toBeVisible({ timeout: 5000 })
    await expect(card.locator('.document-card__title')).toHaveText('Untitled')

    // Allow Yjs to persist the card
    await page.waitForTimeout(2000)

    // 2. Double-click on that node to open it
    const box = await card.boundingBox()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1000)

    // 3. Change its title
    const patchDone = page.waitForResponse(
      resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH',
    )
    await page.locator('.drawing-title__display').click()
    await page.locator('.drawing-title__input').fill('Renamed Node')
    await page.locator('.drawing-title__input').press('Enter')
    await patchDone

    // 4. Go back to the first canvas
    await page.goto(`/#/d/${parentDocId}`)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

    // 5. Assert the title changed on the card
    const cardAfter = page.locator('[data-testid="document-card"]')
    await expect(cardAfter.locator('.document-card__title')).toHaveText('Renamed Node', { timeout: 10_000 })
  })

  test('circular reference: link existing canvas, double-click to navigate back', async ({ page }) => {
    // 1. Start on canvas A
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const canvasAId = getDocumentId(page.url())
    await page.waitForTimeout(1500)

    // Rename canvas A so we can identify it
    const patchA = page.waitForResponse(
      r => r.url().includes('/api/documents/') && r.request().method() === 'PATCH',
    )
    await page.locator('.drawing-title__display').click()
    await page.locator('.drawing-title__input').fill('Canvas A')
    await page.locator('.drawing-title__input').press('Enter')
    await patchA

    // 2. Insert a new node → creates canvas B
    await page.locator('[data-testid="insert-node"]').click()
    await page.locator('[data-testid="node-picker"]').waitFor({ state: 'visible', timeout: 3000 })
    await page.locator('[data-testid="node-picker-new"]').click()

    const cardOnA = page.locator('[data-testid="document-card"]')
    await expect(cardOnA).toHaveCount(1, { timeout: 5000 })

    // Wait for Yjs persistence
    await page.waitForTimeout(2000)

    // 3. Double-click card to enter canvas B
    const box = await cardOnA.boundingBox()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const canvasBId = getDocumentId(page.url())
    expect(canvasBId).not.toBe(canvasAId)
    await page.waitForTimeout(1500)

    // 4. On canvas B, insert a link to the existing canvas A
    await page.locator('[data-testid="insert-node"]').click()
    await page.locator('[data-testid="node-picker"]').waitFor({ state: 'visible', timeout: 3000 })

    // Canvas A should appear in the list — click it
    const canvasAEntry = page.locator(`[data-testid="node-picker-doc-${canvasAId}"]`)
    await expect(canvasAEntry).toBeVisible({ timeout: 5000 })
    await canvasAEntry.click()

    const cardOnB = page.locator('[data-testid="document-card"]')
    await expect(cardOnB).toHaveCount(1, { timeout: 5000 })
    await expect(cardOnB.locator('.document-card__title')).toHaveText('Canvas A', { timeout: 5000 })

    // Wait for Yjs persistence
    await page.waitForTimeout(2000)

    // 5. Double-click the canvas A card to go back
    const box2 = await cardOnB.boundingBox()
    await page.mouse.dblclick(box2!.x + box2!.width / 2, box2!.y + box2!.height / 2)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

    // 6. We should be back on canvas A
    expect(getDocumentId(page.url())).toBe(canvasAId)

    // And it should still have the card pointing to canvas B
    const cardBackOnA = page.locator('[data-testid="document-card"]')
    await expect(cardBackOnA).toHaveCount(1, { timeout: 10_000 })
  })

  test('history breadcrumbs show last 3 pages and navigate on click', async ({ page }) => {
    // Create 4 named documents
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    const names = ['Page A', 'Page B', 'Page C', 'Page D']
    const ids: string[] = []
    for (const name of names) {
      const result = await apiCall(page, 'POST', '/api/documents', { title: name, type: 'canvas' })
      ids.push((result.data as { document: { id: string } }).document.id)
    }

    // Navigate through them: A → B → C → D
    for (const id of ids) {
      await page.goto(`/#/d/${id}`)
      await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(500)
    }

    // Now on Page D — breadcrumb should show last 3: A, B, C (not D, that's current)
    const crumbs = page.locator('[data-testid="history-breadcrumb"] [data-testid="breadcrumb-item"]')
    await expect(crumbs).toHaveCount(3, { timeout: 5000 })
    await expect(crumbs.nth(0)).toContainText('Page A')
    await expect(crumbs.nth(1)).toContainText('Page B')
    await expect(crumbs.nth(2)).toContainText('Page C')

    // Click Page B breadcrumb → should navigate there
    await crumbs.nth(1).click()
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    expect(getDocumentId(page.url())).toBe(ids[1])
  })

  test('breadcrumbs update when a canvas is renamed', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Create two documents
    const resA = await apiCall(page, 'POST', '/api/documents', { title: 'Alpha', type: 'canvas' })
    const idA = (resA.data as { document: { id: string } }).document.id
    const resB = await apiCall(page, 'POST', '/api/documents', { title: 'Beta', type: 'canvas' })
    const idB = (resB.data as { document: { id: string } }).document.id

    // Visit A
    await page.goto(`/#/d/${idA}`)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(500)

    // Rename A to "Alpha Renamed"
    const patchA = page.waitForResponse(
      r => r.url().includes('/api/documents/') && r.request().method() === 'PATCH',
    )
    await page.locator('.drawing-title__display').click()
    await page.locator('.drawing-title__input').fill('Alpha Renamed')
    await page.locator('.drawing-title__input').press('Enter')
    await patchA

    // Visit B
    await page.goto(`/#/d/${idB}`)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(500)

    // Rename B to "Beta Renamed"
    const patchB = page.waitForResponse(
      r => r.url().includes('/api/documents/') && r.request().method() === 'PATCH',
    )
    await page.locator('.drawing-title__display').click()
    await page.locator('.drawing-title__input').fill('Beta Renamed')
    await page.locator('.drawing-title__input').press('Enter')
    await patchB

    // Navigate to a third page so A and B show as breadcrumbs
    const resC = await apiCall(page, 'POST', '/api/documents', { title: 'Charlie', type: 'canvas' })
    const idC = (resC.data as { document: { id: string } }).document.id
    await page.goto(`/#/d/${idC}`)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

    // Breadcrumbs should show the RENAMED titles (last two entries before current)
    const crumbs = page.locator('[data-testid="history-breadcrumb"] [data-testid="breadcrumb-item"]')
    const count = await crumbs.count()
    // The last two breadcrumbs should be Alpha Renamed and Beta Renamed
    await expect(crumbs.nth(count - 2)).toContainText('Alpha Renamed')
    await expect(crumbs.nth(count - 1)).toContainText('Beta Renamed')
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
