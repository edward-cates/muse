import { test, expect, type Page } from '@playwright/test'

test.setTimeout(90_000)

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

// Mock decompose response (returned by mock Anthropic for the report_topics tool)
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
  test('decompose_text creates decomposition cards on workspace canvas', async ({ page }) => {
    // The mock Anthropic response queue:
    // 1. Agent turn 1 (streaming): decompose_text tool call
    // 2. decomposeText internal call (non-streaming): report_topics with mock topics
    // 3. Agent turn 2 (streaming): final text
    await configureMock([
      // Turn 1: decompose_text (no target_document_id — cards go directly on workspace)
      {
        content: [{
          type: 'tool_use', id: 'dt1', name: 'decompose_text',
          input: {
            text: 'Line 1: Cloud cost optimization strategies\nLine 2: Right-sizing instances\nLine 3: Reserved capacity planning\nLine 4: Spot instance usage\nLine 5: Cost monitoring dashboards\nLine 6: Budget alerts and governance\nLine 7: FinOps team structure\nLine 8: Chargeback models\nLine 9: Auto-scaling fundamentals\nLine 10: Horizontal vs vertical scaling\nLine 11: Load-based triggers\nLine 12: Predictive scaling\nLine 13: Scale-to-zero patterns\nLine 14: Container orchestration\nLine 15: Serverless scaling\nLine 16: Database read replicas\nLine 17: CDN and edge caching\nLine 18: Queue-based load leveling\nLine 19: Zero-trust networking\nLine 20: Secrets management\nLine 21: Key rotation automation\nLine 22: Network segmentation\nLine 23: WAF configuration\nLine 24: DDoS mitigation\nLine 25: Compliance frameworks',
            title: 'Cloud Architecture Best Practices',
          },
        }],
        stop_reason: 'tool_use',
      },
      // decomposeText internal call → report_topics (non-streaming)
      {
        content: [{
          type: 'tool_use', id: 'rt1', name: 'report_topics',
          input: { topics: MOCK_TOPICS },
        }],
        stop_reason: 'tool_use',
      },
      // Turn 2: final text
      {
        content: [{ type: 'text', text: 'Research complete! Found 3 key themes across cloud architecture.' }],
        stop_reason: 'end_turn',
      },
    ])

    // 1. Navigate to parent canvas
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)

    // 2. Mock classify at browser level
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

    // 3. Trigger the flow
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('research cloud architecture best practices')
    await input.press('Enter')

    // 4. Workspace card appears on parent canvas immediately
    const parentCard = page.locator('[data-testid="document-card"]').first()
    await expect(parentCard).toBeVisible({ timeout: 10_000 })

    // 5. Wait for job completion
    await expect(parentCard.locator('.document-card__job-status')).toBeHidden({ timeout: 45_000 })

    // 6. Navigate into the workspace canvas
    await parentCard.dblclick()
    await page.waitForTimeout(2000)

    // 7. Verify: workspace canvas has 3 decomposition cards
    const decompCards = page.locator('[data-testid="decomposition-card"]')
    await expect(decompCards).toHaveCount(3, { timeout: 10_000 })

    // Each decomposition card should have a topic title
    await expect(decompCards.nth(0).locator('.decomposition-card__topic')).toContainText('Cost Optimization')
    await expect(decompCards.nth(1).locator('.decomposition-card__topic')).toContainText('Auto-Scaling Patterns')
    await expect(decompCards.nth(2).locator('.decomposition-card__topic')).toContainText('Security Considerations')
  })
})
