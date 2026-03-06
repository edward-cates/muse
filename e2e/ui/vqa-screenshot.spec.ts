import { test, expect, type Page } from '@playwright/test'
import { CanvasPage } from './fixtures'

/** Create a shape via the Yjs doc exposed by TestRoot */
async function createShape(
  page: Page,
  opts: { id: string; x: number; y: number; w: number; h: number; fill: string; text?: string },
) {
  await page.evaluate((o) => {
    const doc = window.__testDoc!
    const Y = window.__testY!
    const elements = doc.getArray('elements')
    const yEl = new Y.Map()
    yEl.set('id', o.id)
    yEl.set('type', 'rectangle')
    yEl.set('x', o.x)
    yEl.set('y', o.y)
    yEl.set('width', o.w)
    yEl.set('height', o.h)
    yEl.set('fill', o.fill)
    yEl.set('stroke', '#000000')
    yEl.set('strokeWidth', 2)
    yEl.set('text', o.text ?? '')
    elements.push([yEl])
  }, opts)
}

test.describe('VQA screenshot pipeline', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('captureCanvas produces a valid PNG containing the drawn shapes', async ({ page }) => {
    // Draw a bright red rectangle at a known position
    await createShape(page, {
      id: 'red-box', x: 200, y: 200, w: 200, h: 150, fill: '#ff0000', text: 'Hello',
    })

    // Draw a blue rectangle elsewhere
    await createShape(page, {
      id: 'blue-box', x: 500, y: 200, w: 200, h: 150, fill: '#0000ff',
    })

    // Wait for shapes to render
    await expect(canvas.shapes).toHaveCount(2)

    // Call captureCanvas from the browser and get the base64 PNG
    const base64 = await page.evaluate(async () => {
      // Import the capture function dynamically (Vite bundles it)
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')
      if (!canvasEl) throw new Error('Canvas element not found')
      return captureCanvas(canvasEl)
    })

    // 1. Must be a non-empty base64 string (no data:... prefix — captureCanvas strips it)
    expect(base64).toBeTruthy()
    expect(base64).not.toContain('data:')
    expect(base64.length).toBeGreaterThan(1000) // A real PNG is not tiny

    // 2. Must be valid base64 that decodes to a PNG
    const isValidBase64 = /^[A-Za-z0-9+/]+=*$/.test(base64)
    expect(isValidBase64).toBe(true)

    // Decode and check PNG magic bytes
    const binary = Buffer.from(base64, 'base64')
    const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    for (let i = 0; i < pngMagic.length; i++) {
      expect(binary[i]).toBe(pngMagic[i])
    }
  })

  test('screenshot contains pixels from drawn shapes, not a blank image', async ({ page }) => {
    // Create a large, distinctly-colored shape that fills a known area
    await createShape(page, {
      id: 'big-green', x: 100, y: 100, w: 300, h: 300, fill: '#00ff00',
    })
    await expect(canvas.shapes).toHaveCount(1)

    // Capture screenshot and render it onto a real canvas to read pixels
    const result = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')
      if (!canvasEl) throw new Error('Canvas element not found')
      const base64 = await captureCanvas(canvasEl)

      // Load the base64 PNG into an <img>, draw onto a canvas, sample pixels
      return new Promise<{ width: number; height: number; greenPixels: number; totalPixels: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data

          let greenPixels = 0
          const totalPixels = c.width * c.height
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            // "Green-ish": green channel dominant
            if (g > 100 && g > r + 50 && g > b + 50) {
              greenPixels++
            }
          }
          resolve({ width: img.width, height: img.height, greenPixels, totalPixels })
        }
        img.onerror = () => reject(new Error('Failed to load screenshot PNG'))
        img.src = `data:image/png;base64,${base64}`
      })
    })

    // The image should have real dimensions
    expect(result.width).toBeGreaterThan(100)
    expect(result.height).toBeGreaterThan(100)

    // The big green box should produce visible green pixels in the screenshot
    // Even at 0.5x scale, a 300x300 green box should have plenty of green pixels
    expect(result.greenPixels).toBeGreaterThan(100)
  })

  test('screenshot content matches the actual rendered canvas', async ({ page }) => {
    // Place two distinctly colored shapes at known, separated positions
    await createShape(page, {
      id: 'red-top', x: 100, y: 50, w: 200, h: 100, fill: '#ff0000',
    })
    await createShape(page, {
      id: 'blue-bottom', x: 400, y: 300, w: 200, h: 100, fill: '#0000ff',
    })
    await expect(canvas.shapes).toHaveCount(2)

    // Take a Playwright screenshot of the canvas element (ground truth)
    const canvasEl = page.locator('[data-testid="canvas"]')
    const playwrightPng = await canvasEl.screenshot()

    // Capture via captureCanvas (what the AI sees)
    const aiBase64 = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const el = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')!
      return captureCanvas(el)
    })

    // Compare both images pixel-by-pixel in the browser
    // We scale the Playwright screenshot down to match captureCanvas's 0.5x scale
    const comparison = await page.evaluate(async ({ pwB64, aiB64 }) => {
      function loadImage(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('Failed to load image'))
          img.src = src
        })
      }

      function getPixels(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        return ctx.getImageData(0, 0, w, h).data
      }

      const aiImg = await loadImage(`data:image/png;base64,${aiB64}`)
      const pwImg = await loadImage(`data:image/png;base64,${pwB64}`)

      // Use the AI screenshot dimensions as the comparison size
      const w = aiImg.width
      const h = aiImg.height
      const aiPixels = getPixels(aiImg, w, h)
      const pwPixels = getPixels(pwImg, w, h)

      let matchingPixels = 0
      let totalPixels = w * h
      let redInAi = 0
      let blueInAi = 0
      let redInPw = 0
      let blueInPw = 0

      for (let i = 0; i < aiPixels.length; i += 4) {
        const [ar, ag, ab] = [aiPixels[i], aiPixels[i + 1], aiPixels[i + 2]]
        const [pr, pg, pb] = [pwPixels[i], pwPixels[i + 1], pwPixels[i + 2]]

        // Count matching pixels (within tolerance for antialiasing/compression)
        if (Math.abs(ar - pr) < 30 && Math.abs(ag - pg) < 30 && Math.abs(ab - pb) < 30) {
          matchingPixels++
        }

        // Count red and blue pixels in each image
        if (ar > 180 && ag < 80 && ab < 80) redInAi++
        if (ab > 180 && ar < 80 && ag < 80) blueInAi++
        if (pr > 180 && pg < 80 && pb < 80) redInPw++
        if (pb > 180 && pr < 80 && pg < 80) blueInPw++
      }

      return { matchingPixels, totalPixels, redInAi, blueInAi, redInPw, blueInPw, w, h }
    }, {
      pwB64: playwrightPng.toString('base64'),
      aiB64: aiBase64,
    })

    // Both images should contain the red shape
    expect(comparison.redInAi).toBeGreaterThan(50)
    expect(comparison.redInPw).toBeGreaterThan(50)

    // Both images should contain the blue shape
    expect(comparison.blueInAi).toBeGreaterThan(50)
    expect(comparison.blueInPw).toBeGreaterThan(50)

    // At least 85% of pixels should match between the two captures
    // (html2canvas rendering may differ slightly from browser rendering)
    const matchRate = comparison.matchingPixels / comparison.totalPixels
    expect(matchRate).toBeGreaterThan(0.85)
  })

  test('fitToContent + screenshot captures all shapes even when content is wider than canvas', async ({ page }) => {
    // Place shapes spread far apart — wider than the canvas element
    // This forces fitToContent to zoom out. If fitToContent miscalculates
    // using window.innerWidth instead of canvas element width, the right
    // shape will be clipped from the screenshot.
    await createShape(page, {
      id: 'left-red', x: 0, y: 200, w: 150, h: 100, fill: '#ff0000',
    })
    await createShape(page, {
      id: 'right-blue', x: 1400, y: 200, w: 150, h: 100, fill: '#0000ff',
    })
    await expect(canvas.shapes).toHaveCount(2)

    // Click canvas first to ensure keyboard focus is on the window (not a toolbar button)
    await page.mouse.click(600, 300)
    await page.waitForTimeout(50)

    // Trigger fitToContent via Shift+1 (same as what VQA pipeline does before capture)
    await page.keyboard.press('Shift+1')
    // Wait for the viewport transform to update
    await page.waitForTimeout(200)

    const result = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')!
      const base64 = await captureCanvas(canvasEl)

      return new Promise<{ redPixels: number; bluePixels: number; width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data

          let redPixels = 0, bluePixels = 0
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
            if (r > 180 && g < 80 && b < 80) redPixels++
            if (b > 180 && r < 80 && g < 80) bluePixels++
          }
          resolve({ redPixels, bluePixels, width: img.width, height: img.height })
        }
        img.onerror = () => reject(new Error('Failed to load'))
        img.src = `data:image/png;base64,${base64}`
      })
    })

    // Both shapes must be visible in the screenshot
    // If fitToContent used window.innerWidth instead of canvas width,
    // the blue shape at x=1400 would be clipped off the right edge
    expect(result.redPixels).toBeGreaterThan(50)
    expect(result.bluePixels).toBeGreaterThan(50)
  })

  test('screenshot captures the canvas element, not the full page or AI panel', async ({ page }) => {
    await createShape(page, {
      id: 'marker', x: 300, y: 300, w: 100, h: 100, fill: '#ff00ff',
    })
    await expect(canvas.shapes).toHaveCount(1)

    // Get the canvas element's actual dimensions in the browser
    const canvasEl = page.locator('[data-testid="canvas"]')
    const canvasBox = await canvasEl.boundingBox()
    expect(canvasBox).toBeTruthy()

    // Get the full page dimensions for comparison
    const viewportSize = page.viewportSize()
    expect(viewportSize).toBeTruthy()

    // The canvas element should NOT span the full viewport width
    // (the AI panel takes ~380px on the right)
    expect(canvasBox!.width).toBeLessThan(viewportSize!.width)

    // Capture via captureCanvas (what the AI sees) and check its dimensions
    const dims = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')!
      const base64 = await captureCanvas(canvasEl)

      return new Promise<{
        imgWidth: number; imgHeight: number
        elWidth: number; elHeight: number
      }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({
          imgWidth: img.width,
          imgHeight: img.height,
          elWidth: canvasEl.clientWidth,
          elHeight: canvasEl.clientHeight,
        })
        img.onerror = () => reject(new Error('Failed to load'))
        img.src = `data:image/png;base64,${base64}`
      })
    })

    // captureCanvas uses SCALE = 0.5, so the image should be half the element size
    // (allow ±2px for rounding)
    expect(dims.imgWidth).toBeCloseTo(dims.elWidth * 0.5, -1)
    expect(dims.imgHeight).toBeCloseTo(dims.elHeight * 0.5, -1)

    // The image width should match the canvas area, NOT the full viewport
    // Full viewport includes the 380px AI panel
    expect(dims.imgWidth).toBeLessThan(viewportSize!.width * 0.5)
  })

  test('screenshot is passed to the AI API in the correct Anthropic message format', async ({ page }) => {
    await createShape(page, {
      id: 'test-shape', x: 200, y: 200, w: 160, h: 80, fill: '#4465e9',
    })
    await expect(canvas.shapes).toHaveCount(1)

    // Build the API message the same way AiPanel does
    const apiMessage = await page.evaluate(async () => {
      const { captureCanvas, computeBounds } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')
      if (!canvasEl) throw new Error('Canvas element not found')
      const base64 = await captureCanvas(canvasEl)

      // Simulate computeBounds with test data
      const elements = [{ x: 200, y: 200, width: 160, height: 80 }]
      const bounds = computeBounds(elements as any)
      const boundsText = bounds
        ? `Content bounds: x=${bounds.x} y=${bounds.y} ${bounds.width}×${bounds.height}`
        : 'Canvas is empty'

      // Build tool_result blocks the same way AiPanel.tsx does
      const toolResultBlocks: unknown[] = [
        { type: 'tool_result', tool_use_id: 'test-tool-123', content: '{"success": true}' },
        { type: 'text', text: `[Screenshot of canvas after your changes. ${boundsText}. Verify the layout looks correct — fix overlaps or missing connections.]` },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
      ]

      const userMessage = { role: 'user', content: toolResultBlocks }
      return { userMessage, base64Length: base64.length, boundsText }
    })

    // Verify the message structure matches Anthropic's expected format
    const msg = apiMessage.userMessage
    expect(msg.role).toBe('user')
    expect(Array.isArray(msg.content)).toBe(true)

    const blocks = msg.content as any[]
    expect(blocks).toHaveLength(3)

    // Block 0: tool_result
    expect(blocks[0].type).toBe('tool_result')
    expect(blocks[0].tool_use_id).toBe('test-tool-123')

    // Block 1: text context about bounds
    expect(blocks[1].type).toBe('text')
    expect(blocks[1].text).toContain('Screenshot of canvas')
    expect(blocks[1].text).toContain('Content bounds:')

    // Block 2: image block with correct structure
    expect(blocks[2].type).toBe('image')
    expect(blocks[2].source.type).toBe('base64')
    expect(blocks[2].source.media_type).toBe('image/png')
    expect(typeof blocks[2].source.data).toBe('string')
    expect(blocks[2].source.data.length).toBeGreaterThan(1000)

    // The base64 data must NOT have the data URL prefix
    expect(blocks[2].source.data).not.toContain('data:')

    // Must be valid base64
    const isValidBase64 = /^[A-Za-z0-9+/]+=*$/.test(blocks[2].source.data)
    expect(isValidBase64).toBe(true)
  })

  test('screenshot captures images placed on the canvas', async ({ page }) => {
    // Create a small red PNG as a data URL (1x1 red pixel, tiled into a visible block)
    const redPixelDataUrl = await page.evaluate(() => {
      const c = document.createElement('canvas')
      c.width = 80
      c.height = 80
      const ctx = c.getContext('2d')!
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 80, 80)
      return c.toDataURL('image/png')
    })

    // Add an image element via Yjs
    await page.evaluate((src) => {
      const doc = window.__testDoc!
      const Y = window.__testY!
      const elements = doc.getArray('elements')
      const yEl = new Y.Map()
      yEl.set('id', 'test-img')
      yEl.set('type', 'image')
      yEl.set('x', 200)
      yEl.set('y', 200)
      yEl.set('width', 200)
      yEl.set('height', 200)
      yEl.set('src', src)
      elements.push([yEl])
    }, redPixelDataUrl)

    await expect(page.locator('[data-testid="image-element"]')).toHaveCount(1)

    const result = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')!
      const base64 = await captureCanvas(canvasEl)

      return new Promise<{ redPixels: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data
          let redPixels = 0
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) redPixels++
          }
          resolve({ redPixels })
        }
        img.onerror = () => reject(new Error('Failed to load'))
        img.src = `data:image/png;base64,${base64}`
      })
    })

    // The red image should have visible red pixels in the screenshot
    expect(result.redPixels).toBeGreaterThan(50)
  })

  test('screenshot renders placeholder for cross-origin images', async ({ page }) => {
    // Add an image element with a cross-origin URL (will fail to load in test)
    await page.evaluate(() => {
      const doc = window.__testDoc!
      const Y = window.__testY!
      const elements = doc.getArray('elements')
      const yEl = new Y.Map()
      yEl.set('id', 'remote-img')
      yEl.set('type', 'image')
      yEl.set('x', 200)
      yEl.set('y', 200)
      yEl.set('width', 250)
      yEl.set('height', 200)
      yEl.set('src', 'https://example.com/cross-origin-image.png')
      elements.push([yEl])
    })

    await expect(page.locator('[data-testid="image-element"]')).toHaveCount(1)

    const result = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')!
      const base64 = await captureCanvas(canvasEl)

      return new Promise<{ hasNonWhitePixels: boolean }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data
          let nonWhite = 0
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 128 && (data[i] < 230 || data[i + 1] < 230 || data[i + 2] < 230)) nonWhite++
          }
          resolve({ hasNonWhitePixels: nonWhite > 20 })
        }
        img.onerror = () => reject(new Error('Failed to load'))
        img.src = `data:image/png;base64,${base64}`
      })
    })

    // The placeholder should render visible content (labeled box, not blank)
    expect(result.hasNonWhitePixels).toBe(true)
  })

  test('screenshot renders placeholder for iframe-based HTML wireframes', async ({ page }) => {
    // Inject an iframe element inside the canvas world (simulates an html_artifact card)
    await page.evaluate(() => {
      const world = document.querySelector('.canvas__world')!
      const card = document.createElement('div')
      card.className = 'shape document-card document-card--html'
      card.style.cssText = 'position:absolute;left:200px;top:200px;width:300px;height:250px;'

      const chrome = document.createElement('div')
      chrome.className = 'document-card__chrome'
      card.appendChild(chrome)

      const title = document.createElement('div')
      title.className = 'document-card__title'
      title.textContent = 'My Wireframe'
      card.appendChild(title)

      const preview = document.createElement('div')
      preview.className = 'document-card__preview'
      preview.style.cssText = 'position:relative;overflow:hidden;width:300px;height:226px;top:24px;'

      const iframe = document.createElement('iframe')
      iframe.srcdoc = '<html><body style="background:blue"><h1>Hello</h1></body></html>'
      iframe.setAttribute('sandbox', '')
      iframe.style.cssText = 'width:800px;height:600px;transform:scale(0.375);transform-origin:top left;border:none;pointer-events:none;'
      preview.appendChild(iframe)
      card.appendChild(preview)
      world.appendChild(card)
    })

    // Wait for the DOM to settle
    await page.waitForTimeout(100)

    const result = await page.evaluate(async () => {
      const { captureCanvas } = await import('/src/ai/canvasCapture.ts')
      const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')!
      const base64 = await captureCanvas(canvasEl)

      return new Promise<{ width: number; height: number; hasNonWhitePixels: boolean }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data

          // Check that the placeholder rendered something (not just white/transparent)
          let nonWhite = 0
          for (let i = 0; i < data.length; i += 4) {
            const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
            // Count pixels that aren't white/near-white and aren't transparent
            if (a > 128 && (r < 230 || g < 230 || b < 230)) nonWhite++
          }
          resolve({ width: img.width, height: img.height, hasNonWhitePixels: nonWhite > 20 })
        }
        img.onerror = () => reject(new Error('Failed to load'))
        img.src = `data:image/png;base64,${base64}`
      })
    })

    // The placeholder should have rendered visible content (not a blank white area)
    expect(result.hasNonWhitePixels).toBe(true)
  })
})
