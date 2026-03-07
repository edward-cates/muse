import { test, expect, type Page } from '@playwright/test'

test.setTimeout(60_000)

const MOCK_URL = 'http://localhost:4999'

// ── Helpers ──

async function configureMock(responses: unknown[]) {
  await fetch(`${MOCK_URL}/__reset`, { method: 'POST' })
  await fetch(`${MOCK_URL}/__configure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  })
}

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
      const res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json().catch(() => null)
      return { status: res.status, data }
    },
    { method, path, body },
  )
}

// ── Tests ──

test.describe('AI research with server-side jobs', () => {
  test('worker creates web cards on workspace canvas', async ({ page }) => {
    // Configure mock Anthropic: add_web_card → final text
    await configureMock([
      {
        content: [{
          type: 'tool_use', id: 'wc1', name: 'add_web_card',
          input: {
            x: 100, y: 100, width: 280, height: 160,
            url: 'https://example.com/ai-trends',
            title: 'AI Trends 2026',
            snippet: 'Key findings on AI adoption and safety',
          },
        }],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'Research complete! Found key insights about AI trends.' }],
        stop_reason: 'end_turn',
      },
    ])

    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // Mock classify at browser level (browser sends this request, not the server)
    await page.route('**/api/ai/classify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ intent: 'compose' }),
      })
    })
    await page.route('**/api/ailog/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // Send prompt
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('research AI trends')
    await input.press('Enter')

    // Workspace card appears on parent canvas immediately (client creates it)
    const parentCard = page.locator('[data-testid="document-card"]').first()
    await expect(parentCard).toBeVisible({ timeout: 10_000 })

    // Wait for job completion — the job-status badge disappears when completed
    await expect(parentCard.locator('.document-card__job-status')).toBeHidden({ timeout: 45_000 })

    // Navigate into workspace canvas
    await parentCard.dblclick()
    await page.waitForTimeout(2000)

    // Verify: web card created by worker on workspace canvas
    const webcard = page.locator('[data-testid="webcard-element"]')
    await expect(webcard).toHaveCount(1, { timeout: 10_000 })
    await expect(webcard.locator('.webcard__title')).toContainText('AI Trends 2026')
  })

  test('worker creates sub-node and sets description via update_element', async ({ page }) => {
    // Configure mock: add_node → update_element (set description) → final text
    await configureMock([
      {
        content: [{
          type: 'tool_use', id: 'n1', name: 'add_node',
          input: { title: 'AI Research Results', x: 200, y: 200, width: 280, height: 180 },
        }],
        stop_reason: 'tool_use',
      },
      {
        content: [{
          type: 'tool_use', id: 'u1', name: 'update_element',
          input: {
            id: '$ref:n1:cardElementId',
            description: 'Key findings on AI adoption, safety trends, and emerging regulations.',
          },
        }],
        stop_reason: 'tool_use',
      },
      {
        content: [{ type: 'text', text: 'Research complete with summary.' }],
        stop_reason: 'end_turn',
      },
    ])

    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    await page.route('**/api/ai/classify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ intent: 'compose' }),
      })
    })
    await page.route('**/api/ailog/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('research AI trends')
    await input.press('Enter')

    // Workspace card on parent canvas
    const parentCard = page.locator('[data-testid="document-card"]').first()
    await expect(parentCard).toBeVisible({ timeout: 10_000 })

    // Wait for completion
    await expect(parentCard.locator('.document-card__job-status')).toBeHidden({ timeout: 45_000 })

    // Navigate into workspace canvas
    await parentCard.dblclick()
    await page.waitForTimeout(2000)

    // Verify: workspace has a sub-canvas document card with description
    const docCard = page.locator('[data-testid="document-card"]')
    await expect(docCard).toHaveCount(1, { timeout: 10_000 })
    await expect(docCard.locator('.document-card__description')).toContainText(
      'Key findings on AI adoption',
      { timeout: 5000 },
    )
  })
})
