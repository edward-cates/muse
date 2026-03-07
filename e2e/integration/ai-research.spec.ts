import { test, expect, type Page } from '@playwright/test'

test.setTimeout(60_000)

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

/**
 * Build an SSE body string for a single tool_use call.
 */
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

// ── Test ──

test.describe('AI research with server-side element writes', () => {
  test('AI writes research cards to child canvas via server API while user navigates away', async ({ page }) => {
    // 1. Navigate to the parent canvas
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // 2. Create a child canvas document via API (simulates what add_node produces)
    const childResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'AI Research',
      type: 'canvas',
    })
    expect(childResult.status).toBe(200)
    const childId = (childResult.data as { document: { id: string } }).document.id

    // 3. Mock AI endpoints
    let aiCallCount = 0
    let webCardId = ''

    // Use 'compose' intent — research now routes to server-side job system.
    // Compose agent has the same tools (add_web_card, etc.) and runs client-side.
    await page.route('**/api/ai/classify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ intent: 'compose' }),
      })
    })

    await page.route('**/api/ai/message', async route => {
      aiCallCount++

      if (aiCallCount === 1) {
        // Turn 1: AI adds a web card to the child canvas
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t1', 'add_web_card', {
            x: 100, y: 100, width: 280, height: 160,
            url: 'https://example.com/ai-trends',
            title: 'AI Trends 2026',
            snippet: 'Key findings on AI adoption and safety',
            target_document_id: childId,
          }) + sseEnd('tool_use'),
        })
      } else if (aiCallCount === 2) {
        // Parse the tool result to extract the web card element ID
        const body = JSON.parse(route.request().postData()!)
        const lastUserMsg = body.messages[body.messages.length - 1]
        for (const block of lastUserMsg.content) {
          if (block.type === 'tool_result') {
            try {
              const parsed = JSON.parse(block.content)
              if (parsed.id) webCardId = parsed.id
            } catch { /* skip non-JSON results */ }
          }
        }

        // Turn 2: AI updates the web card with a better title (via server API)
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t2', 'update_element', {
            id: webCardId,
            title: 'AI Trends 2026 — Key Takeaways',
            target_document_id: childId,
          }) + sseEnd('tool_use'),
        })
      } else {
        // Turn 3: final summary
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseText('Research complete! Found key insights about AI trends.') + sseEnd('end_turn'),
        })
      }
    })

    await page.route('**/api/ailog/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // 4. Start listening for the PATCH response BEFORE triggering the flow
    //    (the agent loop is fast — PATCH may happen before we navigate)
    const patchPromise = page.waitForResponse(
      resp =>
        resp.url().includes(`/api/documents/${childId}/elements`) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
      { timeout: 30_000 },
    )

    // 5. Send the research request
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('research AI trends')
    await input.press('Enter')

    // 6. Wait for the first tool call to hit the server (add_web_card → POST elements)
    await page.waitForResponse(
      resp =>
        resp.url().includes(`/api/documents/${childId}/elements`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    // 7. NAVIGATE AWAY while the agent loop is still running
    const otherDoc = await apiCall(page, 'POST', '/api/documents', { title: 'Other Page', type: 'canvas' })
    const otherId = (otherDoc.data as { document: { id: string } }).document.id
    await page.evaluate((id) => { window.location.hash = `/d/${id}` }, otherId)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

    // 8. Wait for the PATCH (update_element on child canvas) to complete
    await patchPromise

    // 9. Wait for the agent to finish (final text turn)
    await page.waitForTimeout(2000)

    // 10. Verify: the child canvas has content in the DB
    const contentResult = await apiCall(page, 'GET', `/api/documents/${childId}/content`)
    expect(contentResult.status).toBe(200)
    expect(contentResult.data.content).toBeTruthy()
    expect(contentResult.data.content.length).toBeGreaterThan(20)

    // 11. Navigate to the child canvas — the web card should be visible
    await page.evaluate((id) => { window.location.hash = `/d/${id}` }, childId)
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

    // The web card element should be rendered on the canvas
    const webcard = page.locator('[data-testid="webcard-element"]')
    await expect(webcard).toHaveCount(1, { timeout: 10_000 })

    // Verify the updated title from the AI's update_element call
    await expect(webcard.locator('.webcard__title')).toContainText('AI Trends 2026', { timeout: 5000 })

    // 12. Chat history should still be visible (persisted across navigation)
    await expect(page.locator('.ai-chat-markdown')).toContainText('Research complete!')
  })

  test('AI sets description on root-level document card after research', async ({ page }) => {
    // 1. Navigate to the parent canvas
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // 2. Mock AI endpoints
    let aiCallCount = 0
    let cardElementId = ''

    await page.route('**/api/ai/classify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ intent: 'compose' }),
      })
    })

    await page.route('**/api/ai/message', async route => {
      aiCallCount++

      if (aiCallCount === 1) {
        // Turn 1: AI creates a sub-canvas node (adds document card to parent canvas)
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t1', 'add_node', {
            title: 'AI Research Results',
            x: 200, y: 200, width: 280, height: 180,
          }) + sseEnd('tool_use'),
        })
      } else if (aiCallCount === 2) {
        // Extract the cardElementId from the tool result
        const body = JSON.parse(route.request().postData()!)
        const lastUserMsg = body.messages[body.messages.length - 1]
        for (const block of lastUserMsg.content) {
          if (block.type === 'tool_result') {
            try {
              const parsed = JSON.parse(block.content)
              if (parsed.cardElementId) cardElementId = parsed.cardElementId
            } catch { /* skip non-JSON results */ }
          }
        }

        // Turn 2: AI sets description on the document card
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t2', 'update_element', {
            id: cardElementId,
            description: 'Key findings on AI adoption, safety trends, and emerging regulations.',
          }) + sseEnd('tool_use'),
        })
      } else {
        // Turn 3: final summary
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseText('Research complete with summary.') + sseEnd('end_turn'),
        })
      }
    })

    await page.route('**/api/ailog/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // 3. Send the research request
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('research AI trends')
    await input.press('Enter')

    // 4. Wait for agent to finish (final text turn)
    await expect(page.locator('.ai-chat-markdown')).toContainText('Research complete', { timeout: 30_000 })

    // 5. Verify the document card on the parent canvas shows the description
    const docCard = page.locator('[data-testid="document-card"]')
    await expect(docCard).toHaveCount(1, { timeout: 10_000 })
    await expect(docCard.locator('.document-card__description')).toContainText(
      'Key findings on AI adoption',
      { timeout: 5000 },
    )
  })
})
