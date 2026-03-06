import { test, expect, type Page } from '@playwright/test'

test.setTimeout(90_000)

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

// Mock decompose response
const MOCK_TOPICS = [
  {
    title: 'Cost Optimization',
    summary: 'Cloud costs can be reduced by right-sizing instances and using reserved capacity.',
    color: '#f59e0b',
    lineRanges: [{ start: 1, end: 8 }],
  },
  {
    title: 'Auto-Scaling Patterns',
    summary: 'Horizontal scaling with load-based triggers is the most reliable pattern.',
    color: '#3b82f6',
    lineRanges: [{ start: 9, end: 18 }],
  },
  {
    title: 'Security Considerations',
    summary: 'Zero-trust networking and secrets rotation are critical for cloud deployments.',
    color: '#ef4444',
    lineRanges: [{ start: 19, end: 25 }],
  },
]

// ── Tests ──

test.describe('AI research decomposition flow', () => {
  test('decompose_text creates source canvas with decomposition cards and places document card with topic pills', async ({ page }) => {
    // 1. Navigate to parent canvas
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // 2. Create the research canvas (simulates what add_node produces)
    const researchResult = await apiCall(page, 'POST', '/api/documents', {
      title: 'Cloud Architecture Research',
      type: 'canvas',
    })
    expect(researchResult.status).toBe(200)
    const researchCanvasId = researchResult.data.document.id

    // 3. Mock endpoints
    let aiCallCount = 0
    let decomposeCallCount = 0

    // Use 'compose' intent — research now routes to server-side job system.
    // Compose agent has the same tools and runs client-side for testing.
    await page.route('**/api/ai/classify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ intent: 'compose' }),
      })
    })

    // Mock /api/decompose — return structured topics without calling Anthropic
    await page.route('**/api/decompose', async route => {
      decomposeCallCount++
      // Create a real research document via the actual documents API
      // (we intercept decompose but let document creation go through)
      const reqBody = JSON.parse(route.request().postData()!)
      const docResult = await apiCall(page, 'POST', '/api/documents', {
        title: reqBody.title || 'Untitled Research',
        type: 'canvas', // needs to be canvas for elements to be written
      })
      const docId = docResult.data.document.id
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documentId: docId, topics: MOCK_TOPICS }),
      })
    })

    await page.route('**/api/ailog/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    // The AI flow:
    // Turn 1: add_node (create research canvas) — we pre-created it, so the AI
    //         will call add_node and get a DIFFERENT canvas. To keep it simple,
    //         we make the AI call decompose_text directly with our pre-created canvas.
    // Turn 2: decompose_text with target_document_id
    // Turn 3: update_element on the research card with cross-cutting themes
    // Turn 4: final text summary

    await page.route('**/api/ai/message', async route => {
      aiCallCount++

      if (aiCallCount === 1) {
        // Turn 1: AI creates research canvas node
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t1', 'add_node', {
            title: 'Cloud Architecture Research',
            x: 100, y: 100, width: 300, height: 240,
          }) + sseEnd('tool_use'),
        })
      } else if (aiCallCount === 2) {
        // Extract the research canvas documentId from the add_node result
        const body = JSON.parse(route.request().postData()!)
        const lastMsg = body.messages[body.messages.length - 1]
        let researchDocId = ''
        for (const block of lastMsg.content) {
          if (block.type === 'tool_result') {
            try {
              const parsed = JSON.parse(block.content)
              if (parsed.documentId) researchDocId = parsed.documentId
            } catch { /* skip */ }
          }
        }

        // Turn 2: decompose_text targeting the research canvas
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t2', 'decompose_text', {
            text: 'Line 1: Cloud cost optimization strategies\nLine 2: Right-sizing instances\nLine 3: Reserved capacity planning\nLine 4: Spot instance usage\nLine 5: Cost monitoring dashboards\nLine 6: Budget alerts and governance\nLine 7: FinOps team structure\nLine 8: Chargeback models\nLine 9: Auto-scaling fundamentals\nLine 10: Horizontal vs vertical scaling\nLine 11: Load-based triggers\nLine 12: Predictive scaling\nLine 13: Scale-to-zero patterns\nLine 14: Container orchestration\nLine 15: Serverless scaling\nLine 16: Database read replicas\nLine 17: CDN and edge caching\nLine 18: Queue-based load leveling\nLine 19: Zero-trust networking\nLine 20: Secrets management\nLine 21: Key rotation automation\nLine 22: Network segmentation\nLine 23: WAF configuration\nLine 24: DDoS mitigation\nLine 25: Compliance frameworks',
            title: 'Cloud Architecture Best Practices',
            x: 100,
            y: 100,
            target_document_id: researchDocId,
          }) + sseEnd('tool_use'),
        })
      } else if (aiCallCount === 3) {
        // Extract the cardElementId from decompose_text result to update it
        const body = JSON.parse(route.request().postData()!)
        const lastMsg = body.messages[body.messages.length - 1]
        let cardElementId = ''
        let researchDocId = ''
        // Walk backward through messages to find add_node result (has cardElementId for the top-level node)
        for (const msg of body.messages) {
          if (msg.role !== 'user' || !Array.isArray(msg.content)) continue
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              try {
                const parsed = JSON.parse(block.content)
                // add_node returns cardElementId
                if (parsed.cardElementId && parsed.documentId) {
                  cardElementId = parsed.cardElementId
                  researchDocId = parsed.documentId
                }
              } catch { /* skip */ }
            }
          }
        }

        // Turn 3: update top-level card with cross-cutting themes
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseToolUse('t3', 'update_element', {
            id: cardElementId,
            title: 'Cloud Architecture Research',
            topicLabels: 'Cost Optimization|Auto-Scaling|Security',
            topicColors: '#f59e0b|#3b82f6|#ef4444',
          }) + sseEnd('tool_use'),
        })
      } else {
        // Turn 4: final summary
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sseText('Research complete! Found 3 key themes across cloud architecture.') + sseEnd('end_turn'),
        })
      }
    })

    // 4. Trigger the research flow
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('research cloud architecture best practices')
    await input.press('Enter')

    // 5. Wait for the agent to finish
    await expect(page.locator('.ai-chat-markdown')).toContainText('Research complete', { timeout: 30_000 })

    // 6. Verify: /api/decompose was called
    expect(decomposeCallCount).toBeGreaterThanOrEqual(1)

    // 7. Verify: the top-level research card is on the parent canvas with topic pills
    const docCard = page.locator('[data-testid="document-card"]').first()
    await expect(docCard).toBeVisible({ timeout: 10_000 })

    // Check topic pills are rendered on the card
    const topicDots = docCard.locator('.document-card__topic-dot')
    await expect(topicDots).toHaveCount(3, { timeout: 5_000 })

    const topicLabels = docCard.locator('.document-card__topic-label')
    await expect(topicLabels.nth(0)).toContainText('Cost Optimization')
    await expect(topicLabels.nth(1)).toContainText('Auto-Scaling')
    await expect(topicLabels.nth(2)).toContainText('Security')

    // 8. Double-click the research card to navigate into the research canvas
    await docCard.dblclick()
    await page.waitForTimeout(2000)

    // 9. Verify: inside the research canvas, there's a source document card with topic pills
    const sourceCard = page.locator('[data-testid="document-card"]').first()
    await expect(sourceCard).toBeVisible({ timeout: 10_000 })

    // Source card should have the 3 topic pills from decomposition
    const sourceTopicDots = sourceCard.locator('.document-card__topic-dot')
    await expect(sourceTopicDots).toHaveCount(3, { timeout: 5_000 })

    // 10. Double-click the source card to navigate into the source canvas
    await sourceCard.dblclick()
    await page.waitForTimeout(2000)

    // 11. Verify: inside the source canvas, there are decomposition cards
    const decompCards = page.locator('[data-testid="decomposition-card"]')
    await expect(decompCards).toHaveCount(3, { timeout: 10_000 })

    // Each decomposition card should have a topic title
    await expect(decompCards.nth(0).locator('.decomposition-card__topic')).toContainText('Cost Optimization')
    await expect(decompCards.nth(1).locator('.decomposition-card__topic')).toContainText('Auto-Scaling Patterns')
    await expect(decompCards.nth(2).locator('.decomposition-card__topic')).toContainText('Security Considerations')
  })
})
