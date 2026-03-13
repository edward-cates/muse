import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { resolve } from 'node:path'

test.setTimeout(90_000)

// ── Helpers ──

function getDocumentId(url: string): string {
  const match = url.match(/#\/d\/(.+)/)
  if (!match) throw new Error(`No document ID in URL: ${url}`)
  return match[1]
}

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

test.describe('Document sharing (two users)', () => {
  let ctx1: BrowserContext
  let ctx2: BrowserContext
  let page1: Page
  let page2: Page

  test.beforeAll(async ({ browser }) => {
    // User 1: default auth state
    ctx1 = await browser.newContext({
      storageState: resolve('e2e/integration/.auth-state.json'),
    })
    // User 2: second auth state
    ctx2 = await browser.newContext({
      storageState: resolve('e2e/integration/.auth-state-user2.json'),
    })
    page1 = await ctx1.newPage()
    page2 = await ctx2.newPage()
  })

  test.afterAll(async () => {
    await ctx1.close()
    await ctx2.close()
  })

  test('user 1 shares a canvas, user 2 sees it, edits it, user 1 sees the edit', async () => {
    // ── Step 1: User 1 creates a canvas and draws a shape ──
    await page1.goto('/')
    await page1.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const docId = getDocumentId(page1.url())
    await page1.waitForTimeout(1500)

    // Rename it so we can identify it
    const patchDone = page1.waitForResponse(
      r => r.url().includes('/api/documents/') && r.request().method() === 'PATCH',
    )
    await page1.locator('.drawing-title__display').click()
    await page1.locator('.drawing-title__input').fill('Shared Canvas')
    await page1.locator('.drawing-title__input').press('Enter')
    await patchDone

    // Draw a rectangle
    await page1.locator('[data-testid="tool-rectangle"]').click()
    await page1.mouse.move(300, 300)
    await page1.mouse.down()
    await page1.mouse.move(500, 450)
    await page1.mouse.up()
    await page1.waitForTimeout(500)

    // Verify shape exists
    await expect(page1.locator('[data-testid="shape-rectangle"]')).toHaveCount(1)

    // Wait for Yjs to persist
    await page1.waitForTimeout(2000)

    // ── Step 2: User 1 shares with User 2 ──
    const shareResult = await apiCall(page1, 'POST', `/api/documents/${docId}/shares`, {
      email: 'test2@integration.local',
    })
    expect(shareResult.status).toBe(200)
    const share = shareResult.data as { share: { shared_with_id: string | null } }
    // Verify the share resolved to a real user (not pending)
    expect(share.share.shared_with_id).toBeTruthy()

    // ── Step 3: User 2 sees the shared document in their list ──
    await page2.goto('/')
    await page2.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page2.waitForTimeout(1500)

    const listResult = await apiCall(page2, 'GET', '/api/documents')
    const docs = (listResult.data as { documents: Array<{ id: string; shared?: boolean }> }).documents
    const sharedDoc = docs.find(d => d.id === docId)
    expect(sharedDoc).toBeTruthy()
    expect(sharedDoc!.shared).toBe(true)

    // ── Step 4: User 2 opens the shared canvas ──
    await page2.goto(`/#/d/${docId}`)
    await page2.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page2.waitForTimeout(2000)

    // User 2 should see User 1's rectangle
    await expect(page2.locator('[data-testid="shape-rectangle"]')).toHaveCount(1, { timeout: 10_000 })

    // ── Step 5: User 2 draws an ellipse ──
    await page2.locator('[data-testid="tool-ellipse"]').click()
    await page2.mouse.move(600, 300)
    await page2.mouse.down()
    await page2.mouse.move(750, 420)
    await page2.mouse.up()
    await page2.waitForTimeout(500)

    await expect(page2.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)

    // Wait for Yjs sync
    await page2.waitForTimeout(3000)

    // ── Step 6: User 1 sees the ellipse (real-time sync via Yjs) ──
    await expect(page1.locator('[data-testid="shape-ellipse"]')).toHaveCount(1, { timeout: 10_000 })

    // Both users see both shapes
    await expect(page1.locator('[data-testid="shape-rectangle"]')).toHaveCount(1)
    await expect(page1.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)
    await expect(page2.locator('[data-testid="shape-rectangle"]')).toHaveCount(1)
    await expect(page2.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)
  })

  test('shared user cannot delete the document', async () => {
    // User 1 creates a doc
    await page1.goto('/')
    await page1.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const docId = getDocumentId(page1.url())
    await page1.waitForTimeout(1500)

    // Share with user 2
    await apiCall(page1, 'POST', `/api/documents/${docId}/shares`, {
      email: 'test2@integration.local',
    })

    // User 2 tries to delete — should fail
    await page2.goto('/')
    await page2.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page2.waitForTimeout(1000)

    const deleteResult = await apiCall(page2, 'DELETE', `/api/documents/${docId}`)
    // Should be blocked — 403 (not owner)
    expect(deleteResult.status).toBe(403)

    // Document should still exist for user 1
    const getResult = await apiCall(page1, 'GET', `/api/documents/${docId}`)
    expect(getResult.status).toBe(200)
  })

  test('revoking a share removes access', async () => {
    // User 1 creates a doc and shares it
    await page1.goto('/')
    await page1.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    const docId = getDocumentId(page1.url())
    await page1.waitForTimeout(1500)

    const shareResult = await apiCall(page1, 'POST', `/api/documents/${docId}/shares`, {
      email: 'test2@integration.local',
    })
    const share = (shareResult.data as { share: { id: string } }).share

    // User 2 can access it
    await page2.goto('/')
    await page2.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page2.waitForTimeout(1000)

    const accessBefore = await apiCall(page2, 'GET', `/api/documents/${docId}`)
    expect(accessBefore.status).toBe(200)

    // User 1 revokes the share
    const revokeResult = await apiCall(page1, 'DELETE', `/api/documents/${docId}/shares/${share.id}`)
    expect(revokeResult.status).toBe(200)

    // User 2 can no longer access it
    const accessAfter = await apiCall(page2, 'GET', `/api/documents/${docId}`)
    expect(accessAfter.status).toBe(404)
  })
})
