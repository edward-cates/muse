import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

/**
 * Mock the AI classify and message endpoints so we can test
 * the chat UI without a real backend.
 */
async function mockAiEndpoints(page: import('@playwright/test').Page) {
  // Classify always returns 'chat' intent
  await page.route('**/api/ai/classify', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat' }),
    })
  })

  // AI message returns a simple SSE text response
  await page.route('**/api/ai/message', route => {
    const sseBody = [
      'data: {"type":"text_delta","text":"Hello "}\n\n',
      'data: {"type":"text_delta","text":"from the AI!"}\n\n',
      'data: {"type":"message_delta","stop_reason":"end_turn"}\n\n',
      'data: [DONE]\n\n',
    ].join('')

    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseBody,
    })
  })

  // Stub out ailog so it doesn't error
  await page.route('**/api/ailog/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

test.describe('AI chat persistence across navigation', () => {
  test('chat history survives document navigation', async ({ page }) => {
    const canvas = new CanvasPage(page)
    await canvas.goto()
    await mockAiEndpoints(page)

    // Send a message
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('Hello AI')
    await input.press('Enter')

    // Wait for the AI response to appear
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI!')

    // Verify user message is visible
    await expect(page.locator('p').filter({ hasText: 'Hello AI' })).toBeVisible()

    // Navigate to a different document via hash change (triggers App remount)
    await page.evaluate(() => {
      window.location.hash = '/d/different-doc-123'
    })

    // Wait for the new canvas to mount
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })

    // Chat history should still be visible after navigation
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI!')
    await expect(page.locator('p').filter({ hasText: 'Hello AI' })).toBeVisible()
  })

  test('can continue chatting after navigation', async ({ page }) => {
    const canvas = new CanvasPage(page)
    await canvas.goto()
    await mockAiEndpoints(page)

    // First message
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('First message')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI!')

    // Navigate away and back
    await page.evaluate(() => { window.location.hash = '/d/other-doc' })
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })
    await page.evaluate(() => { window.location.hash = '/d/e2e-test' })
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })

    // Original messages should still be there
    await expect(page.locator('p').filter({ hasText: 'First message' })).toBeVisible()

    // Send another message — should work without errors
    await input.fill('Second message')
    await input.press('Enter')

    // Should have both conversations
    await expect(page.locator('p').filter({ hasText: 'First message' })).toBeVisible()
    await expect(page.locator('p').filter({ hasText: 'Second message' })).toBeVisible()
    // Two AI responses
    await expect(page.locator('.ai-chat-markdown')).toHaveCount(2)
  })
})
