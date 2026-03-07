import { test, expect, type Page } from '@playwright/test'

test.setTimeout(60_000)

// ── Helpers ──

function sseToolUse(toolId: string, toolName: string, input: Record<string, unknown>): string {
  const inputJson = JSON.stringify(input)
  return [
    `data: {"type":"tool_use_start","id":"${toolId}","name":"${toolName}"}\n\n`,
    `data: {"type":"input_json_delta","partial_json":${JSON.stringify(inputJson)}}\n\n`,
    `data: {"type":"content_block_stop"}\n\n`,
  ].join('')
}

function sseText(text: string): string {
  return `data: {"type":"text_delta","text":${JSON.stringify(text)}}\n\n`
}

function sseEnd(stopReason: string): string {
  return `data: {"type":"message_delta","stop_reason":"${stopReason}"}\n\n` + `data: [DONE]\n\n`
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

// ── Test ──

const DASHBOARD_HTML = `<!DOCTYPE html>
<html><head><style>body{font-family:sans-serif;margin:0;padding:20px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:#f3f4f6;border-radius:8px;padding:16px}
</style></head><body>
<h1>Dashboard</h1>
<div class="stats"><div class="card">Users: 1,234</div>
<div class="card">Revenue: $56K</div>
<div class="card">Growth: 12%</div></div>
</body></html>`

test.describe('AI wireframe creates document card and streams progress', () => {
  test('wireframe a dashboard: card appears immediately, chat shows progress, card gets HTML', async ({ page }) => {
    // 1. Navigate to canvas
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // 2. Mock AI endpoints
    // Use a gate to hold turn 2 until we've verified the placeholder card.
    let aiCallCount = 0
    let documentId = ''
    let cardElementId = ''
    let releaseTurn2: () => void
    const turn2Gate = new Promise<void>(resolve => { releaseTurn2 = resolve })

    await page.route('**/api/ai/classify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ intent: 'canvas_edit' }),
      })
    })

    await page.route('**/api/ai/message', async route => {
      aiCallCount++

      if (aiCallCount === 1) {
        // Turn 1: AI creates the document card with just a title (no HTML).
        // Card should appear on canvas immediately as a placeholder.
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body:
            sseText("I'll create a dashboard wireframe for you. ") +
            sseToolUse('t1', 'create_document', {
              title: 'Dashboard Wireframe',
              x: 200, y: 200, width: 400, height: 300,
            }) +
            sseEnd('tool_use'),
        })
      } else if (aiCallCount === 2) {
        // Extract documentId and cardElementId from tool result
        const body = JSON.parse(route.request().postData()!)
        const lastUserMsg = body.messages[body.messages.length - 1]
        for (const block of lastUserMsg.content) {
          if (block.type === 'tool_result') {
            try {
              const parsed = JSON.parse(block.content)
              if (parsed.documentId) documentId = parsed.documentId
              if (parsed.cardElementId) cardElementId = parsed.cardElementId
            } catch { /* skip */ }
          }
        }

        // Wait for the test to verify the placeholder card before continuing
        await turn2Gate

        // Turn 2: AI streams progress text, then updates with final HTML
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body:
            sseText('Writing the dashboard layout with stats cards, chart area, and a data table...') +
            sseToolUse('t2', 'update_document_content', {
              document_id: documentId,
              html: DASHBOARD_HTML,
            }) +
            sseEnd('tool_use'),
        })
      } else {
        // Turn 3: final summary
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body:
            sseText('Done! Your dashboard wireframe is ready. Click the card to view it full-size.') +
            sseEnd('end_turn'),
        })
      }
    })

    await page.route('**/api/ailog/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // 3. Send the wireframe request
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('wireframe a dashboard in html')
    await input.press('Enter')

    // 4. Document card should appear on canvas immediately with title (no HTML yet)
    const docCard = page.locator('[data-testid="document-card"]')
    await expect(docCard).toHaveCount(1, { timeout: 15_000 })
    await expect(docCard.locator('.document-card__title')).toContainText('Dashboard Wireframe', { timeout: 5000 })

    // 5. Chat blurbs show streaming progress while agent works
    await expect(page.locator('.ai-chat-markdown').first()).toContainText('dashboard wireframe', { timeout: 10_000 })

    // 6. Release turn 2 — now the HTML gets written
    releaseTurn2!()

    // 7. Wait for the second progress message (writing layout)
    await expect(page.locator('.ai-chat-markdown').filter({ hasText: 'Writing the dashboard layout' })).toBeVisible({ timeout: 15_000 })

    // 8. Wait for agent to finish
    await expect(page.locator('.ai-chat-markdown').filter({ hasText: 'Done!' })).toBeVisible({ timeout: 15_000 })

    // 9. Verify the document has the final HTML content in the DB
    expect(documentId).toBeTruthy()
    const contentResult = await apiCall(page, 'GET', `/api/documents/${documentId}/content`)
    expect(contentResult.status).toBe(200)
    expect(contentResult.data.content).toContain('Dashboard')
    expect(contentResult.data.content).toContain('Revenue')
  })
})
