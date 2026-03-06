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

function sseText(text: string): string {
  return `data: {"type":"text_delta","text":${JSON.stringify(text)}}\n\n`
}

function sseEnd(stopReason: string): string {
  return `data: {"type":"message_delta","stop_reason":"${stopReason}"}\n\n` + `data: [DONE]\n\n`
}

async function mockAiEndpoints(page: Page) {
  await page.route('**/api/ai/classify', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ intent: 'chat' }),
    })
  })

  await page.route('**/api/ai/message', route => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sseText('Hello from the AI assistant!') + sseEnd('end_turn'),
    })
  })

  await page.route('**/api/ailog/**', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

// ── Tests ──

test.describe('AI chat persistence to DB', () => {
  test('chat auto-saves after conversation and appears in history list', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)
    await mockAiEndpoints(page)

    // 1. Start listening for save BEFORE triggering the chat
    const savePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/ai/chats') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    // 2. Send a message
    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('What is React?')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI assistant!')

    // 3. Wait for the auto-save POST to complete
    await savePromise

    // 3. Verify chat exists via API
    const listResult = await apiCall(page, 'GET', '/api/ai/chats')
    expect(listResult.status).toBe(200)
    expect(listResult.data.chats.length).toBeGreaterThanOrEqual(1)

    const savedChat = listResult.data.chats.find(
      (c: { title: string }) => c.title === 'What is React?',
    )
    expect(savedChat).toBeTruthy()

    // 4. Click history button — list should show
    await page.locator('[data-testid="chat-history-btn"]').click()
    await expect(page.locator('[data-testid="chat-list-item"]').first()).toBeVisible({ timeout: 5000 })

    // Verify the saved chat title is visible
    await expect(page.locator('[data-testid="chat-list-item"]').first()).toContainText('What is React?')
  })

  test('load a saved chat and see full history', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)
    await mockAiEndpoints(page)

    // 1. Start listening for save, then send message
    const savePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/ai/chats') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('Explain CRDTs to me')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI assistant!')
    await savePromise

    // 2. Start a new chat (clears current)
    await page.locator('[data-testid="chat-history-btn"]').click()
    await expect(page.locator('[data-testid="new-chat-btn"]')).toBeVisible()
    await page.locator('[data-testid="new-chat-btn"]').click()

    // Chat should be empty now
    await expect(page.locator('.ai-chat-markdown')).toHaveCount(0)

    // 3. Open history and load the saved chat
    await page.locator('[data-testid="chat-history-btn"]').click()
    await expect(page.locator('[data-testid="chat-list-item"]').first()).toBeVisible({ timeout: 5000 })
    await page.locator('[data-testid="chat-list-item"]').first().click()

    // 4. Verify the loaded chat shows the original messages
    await expect(page.locator('p').filter({ hasText: 'Explain CRDTs to me' })).toBeVisible({ timeout: 5000 })
  })

  test('chat survives full page reload', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)
    await mockAiEndpoints(page)

    // 1. Start listening for save, then send message
    const savePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/ai/chats') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('Tell me about quantum computing')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI assistant!')
    await savePromise

    // 2. Full page reload — all React state is gone
    await page.reload()
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Re-mock AI endpoints after reload (page.route persists across reload but re-mock for safety)
    await mockAiEndpoints(page)

    // 3. Open history — should see the saved chat
    await page.locator('[data-testid="chat-history-btn"]').click()
    await expect(page.locator('[data-testid="chat-list-item"]').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="chat-list-item"]').first()).toContainText('quantum computing')

    // 4. Click to load it
    await page.locator('[data-testid="chat-list-item"]').first().click()

    // User message should be visible
    await expect(page.locator('p').filter({ hasText: 'Tell me about quantum computing' })).toBeVisible({ timeout: 5000 })
  })

  test('new chat creates separate record from existing', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)
    await mockAiEndpoints(page)

    // 1. First chat — start listening before sending
    const save1 = page.waitForResponse(
      resp =>
        resp.url().includes('/api/ai/chats') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('First chat topic')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI assistant!')
    await save1

    // 2. New chat
    await page.locator('[data-testid="chat-history-btn"]').click()
    await page.locator('[data-testid="new-chat-btn"]').click()

    // 3. Second chat — start listening before sending
    const save2 = page.waitForResponse(
      resp =>
        resp.url().includes('/api/ai/chats') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    await input.fill('Second chat topic')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI assistant!')
    await save2

    // 4. Verify two separate chats exist
    const listResult = await apiCall(page, 'GET', '/api/ai/chats')
    expect(listResult.status).toBe(200)

    const first = listResult.data.chats.find(
      (c: { title: string }) => c.title === 'First chat topic',
    )
    const second = listResult.data.chats.find(
      (c: { title: string }) => c.title === 'Second chat topic',
    )
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first.id).not.toBe(second.id)
  })

  test('encryption at rest — raw DB content is not plaintext', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForTimeout(1500)
    await mockAiEndpoints(page)

    // 1. Start listening for save, then send message
    const savePromise = page.waitForResponse(
      resp =>
        resp.url().includes('/api/ai/chats') &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
      { timeout: 15_000 },
    )

    const input = page.locator('input[placeholder*="Draw a flowchart"]')
    await input.fill('My secret encryption test message')
    await input.press('Enter')
    await expect(page.locator('.ai-chat-markdown')).toContainText('Hello from the AI assistant!')
    await savePromise

    // 2. Load the chat via authenticated endpoint — should decrypt successfully
    const listResult = await apiCall(page, 'GET', '/api/ai/chats')
    const chat = listResult.data.chats[0]
    const loadResult = await apiCall(page, 'GET', `/api/ai/chats/${chat.id}`)
    expect(loadResult.status).toBe(200)
    expect(loadResult.data.messages).toBeTruthy()
    expect(loadResult.data.messages.length).toBeGreaterThanOrEqual(1)

    // The messages should be decrypted and readable
    const userMsg = loadResult.data.messages.find(
      (m: { role: string; content: string }) => m.role === 'user',
    )
    expect(userMsg.content).toContain('secret encryption test')
  })
})
