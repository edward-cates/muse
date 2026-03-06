# Muse Product Spec

Based on wireframes 01-05. References what exists vs what needs building.

---

## Vision

Muse is a spatial AI canvas where you and the AI both place things — shapes, notes, research, wireframes, images. You think by arranging, connecting, and drilling into nodes. The AI is a collaborator that builds alongside you, not a chatbot sidebar.

Three core capabilities:
1. **Diagramming** — shapes, connectors, text, spatial layout (mostly built)
2. **Research & decomposition** — ingest docs/text, break into topics with source refs, explore spatially (needs building)
3. **Generative media** — AI-generated HTML wireframes and images as canvas nodes (partially built)

---

## Feature Spec

### F1: Breadcrumb Navigation
**Wireframe:** 02, 03, 04
**Status:** parent_id exists in DB, hash routing works, no breadcrumb UI

Build a breadcrumb trail in the top bar showing the navigation path. When you click into any node, the breadcrumb updates.

**What to build:**
- Track navigation stack in client state (array of `{documentId, title}`)
- Render breadcrumb in top bar: each ancestor is a clickable link, current is plain text
- Clicking an ancestor navigates back to that canvas
- "Back" arrow icon before the first breadcrumb item

**Existing code to use:**
- `DocumentShell.tsx` already routes by document type
- `useDocumentMeta()` has title and parent_id
- Hash routing (`#/d/{id}`) already works

**Changes:**
- `client/src/components/DocumentTitle.tsx` → add breadcrumb rendering
- `client/src/App.tsx` or `DocumentShell.tsx` → track nav stack
- Pass nav stack through context or URL hash params

---

### F2: Every Node Opens as a Canvas
**Wireframe:** 01, 02
**Status:** Only DocumentCardElement navigates on double-click. Other nodes don't open.

Every node on the canvas should be openable. Double-click a shape, text note, image — it opens as its own canvas where you can add sub-content.

**What to build:**
- On double-click of any element (shape, text, image, webcard), create or navigate to its backing document
- Each element gets an optional `documentId` field linking it to a backing document
- If no backing doc exists, create one on first open (lazy creation)
- The backing doc is a canvas — you land on it with your drawing tools

**Data model change:**
- Add `documentId: string` to `ShapeElement`, `TextElement`, `ImageElement`, `WebCardElement` in types.ts
- When user double-clicks and no documentId exists: `POST /api/documents` → get new doc ID → store on element → navigate
- When documentId exists: navigate to `#/d/{documentId}`

**Existing code to use:**
- `DocumentCardRenderer.tsx` already handles double-click → navigate. Generalize this pattern.
- `useDocumentApi().createDocument()` already creates documents
- `useDocumentRegistration()` handles document creation

**Changes:**
- `Canvas.tsx` handleDoubleClick → for any element, open its backing document
- `useElements.ts` → `updateElement` to store documentId
- `ShapeRenderer.tsx`, `TextRenderer.tsx`, etc. → visual hint that a node has sub-content (small icon overlay)

---

### F3: HTML Wireframe Thumbnails on Canvas
**Wireframe:** 01, 03, 05
**Status:** DocumentCardElement exists and renders a static card. HtmlArtifactViewer renders full HTML. No inline preview.

HTML wireframes should render as small thumbnails on the canvas — like a zoomed-out screenshot of the page. Click to open full-size in the viewer.

**What to build:**
- `DocumentCardRenderer.tsx` for html_artifact type: render an iframe at small scale (CSS transform: scale) showing the actual HTML content
- The iframe is non-interactive on the canvas (pointer-events: none) — just a visual preview
- Click opens the full HtmlArtifactViewer (already built)
- Browser chrome dots (red/yellow/green) on the card for visual distinction

**Existing code to use:**
- `DocumentCardRenderer.tsx` — already handles document cards, add iframe preview branch
- `HtmlArtifactViewer.tsx` — already renders full HTML, already has AI edit panel
- `useDocumentContent()` — already fetches document content

**Changes:**
- `DocumentCardRenderer.tsx` → when `documentType === 'html_artifact'`, render scaled iframe with content
- Add browser chrome dots to the card header
- Fetch content via `useDocumentContent(documentId)` for the preview

---

### F4: Text Decomposition Pipeline
**Wireframe:** 04
**Status:** Nothing exists. This is the biggest new feature.

User pastes text (or AI produces research output). The LLM decomposes it into topics with summaries and line references pointing back to the original.

**What to build:**

**Server endpoint:** `POST /api/decompose`
- Input: `{ text: string, title?: string }`
- Stores original text as a document (type: 'research')
- Calls Claude with structured output prompt
- Returns: `{ documentId, topics: [{title, summary, lineRanges: [{start, end}], color}] }`

**Decomposition prompt (key design):**
```
Given this document, identify the major topics discussed.
For each topic, provide:
- A short title (2-5 words)
- A 2-3 sentence summary
- The exact line numbers that inform this summary (as ranges)

Return as JSON array. Each line range must be accurate —
the user will click these to see the original text.
```

**Storage:**
- Original text: stored in `documents.content` with type 'research'
- Decomposition result: stored as JSON in a new column `documents.metadata` (JSONB)
- Or: store decomposition as Yjs elements on the research doc's canvas (each topic = a node)

**Recommendation:** Store decomposition in `metadata` JSONB column. The canvas elements (visual layout of the cards) are separate from the data. This way you can re-layout without re-decomposing.

**DB migration:**
- Add `metadata JSONB` column to documents table
- Add `source_text TEXT` column (or reuse `content` — but content is used for HTML artifacts)

**Changes:**
- New migration: `004_research_metadata.sql`
- New server route: `server/src/routes/decompose.ts`
- New AI tool: `decompose_text` in tools.ts

---

### F5: Research Node Type
**Wireframe:** 01, 04, 05
**Status:** WebCardElement exists (URL-based). No research/decomposition node.

A research node is a DocumentCardElement with type 'research'. On the canvas it shows title + topic pills. Click to open its canvas with decomposition cards.

**What to build:**

**Surface appearance (on parent canvas):**
- Green header with document icon
- Title of the ingested document
- Topic pills with colored dots (from decomposition metadata)
- Footer: "N topics, M lines, ingested X ago"
- This is just a `DocumentCardRenderer` variant — when `documentType === 'research'`, render this style

**Inside the research node (its canvas):**
- Auto-generated decomposition cards placed on the canvas
- Each card is a new element type or a styled shape containing: topic title, summary, line ref pills
- User can draw shapes, notes, connectors alongside the cards
- Connectors between decomposition cards and user shapes

**Source text viewer:**
- When user clicks a line reference, show original text in a right panel
- The panel shows the full original text with line numbers
- The referenced lines are highlighted
- Panel replaces the AI panel temporarily (or appears alongside it)

**New element type option: DecompositionCardElement**
```typescript
interface DecompositionCardElement {
  id: string
  type: 'decomposition_card'
  x: number; y: number; width: number; height: number
  topic: string           // title
  summary: string         // 2-3 sentences
  lineRanges: number[]    // flat: [start1, end1, start2, end2, ...]
  color: string           // dot color
  documentId: string      // parent research document
  opacity: number
}
```

**Alternative:** Don't add a new element type. Use TextElement or ShapeElement with metadata. Less clean but fewer changes. Given the source-ref behavior is unique, a dedicated type is better.

**Changes:**
- `client/src/types.ts` → add DecompositionCardElement
- `client/src/components/DecompositionCardRenderer.tsx` → new renderer
- `client/src/components/SourceTextPanel.tsx` → new panel
- `client/src/hooks/useElements.ts` → addDecompositionCard()
- `DocumentCardRenderer.tsx` → research variant rendering
- Canvas.tsx → register new element type

---

### F6: AI Image Generation
**Wireframe:** 01, 05
**Status:** ImageElement exists with renderer, drag, resize. No generation tool. OpenAI key storage exists.

Add an AI tool that generates images and places them on the canvas.

**What to build:**

**Server endpoint:** `POST /api/ai/generate-image`
- Input: `{ prompt: string }` + JWT auth
- Decrypts user's OpenAI API key from user_secrets
- Calls OpenAI image generation API (gpt-image-1 or dall-e-3)
- Stores result image (base64 → Supabase Storage or data URL)
- Returns: `{ imageUrl: string }`

**AI tool:** `generate_image`
```json
{
  "name": "generate_image",
  "description": "Generate an image from a text description and place it on the canvas",
  "parameters": {
    "prompt": "string - description of the image to generate",
    "x": "number", "y": "number",
    "width": "number", "height": "number"
  }
}
```

**Flow:**
1. AI calls generate_image tool
2. Client sends prompt to `/api/ai/generate-image`
3. Server calls OpenAI, gets image back
4. Server stores in Supabase Storage, returns public URL
5. Client calls `addImage({src: url, x, y, width, height})`
6. Image appears on canvas

**Existing code to use:**
- `addImage()` in useElements.ts already exists
- `ImageRenderer.tsx` already renders images
- `server/src/routes/keys.ts` already handles encrypted API key storage
- `server/src/crypto.ts` already handles decryption

**Changes:**
- New server route: `server/src/routes/image-gen.ts`
- `client/src/ai/tools.ts` → add generate_image tool definition
- `client/src/ai/executeToolCall.ts` → handle generate_image (call server endpoint, then addImage)
- Settings panel: add OpenAI API key input (may already exist)

---

### F7: AI Agent Integration
**Wireframe:** 05
**Status:** Agent loop exists with canvas_edit, research, and chat intents. Tools exist for shapes, lines, webcards, documents.

Wire the new features into the AI agent so one prompt can trigger multiple actions.

**What to build:**

**New tools for the canvas editor agent:**
- `decompose_text` — takes pasted text, calls decomposition endpoint, places research node
- `generate_image` — described above
- `generate_html_wireframe` — already exists as `create_document` with type html_artifact, but needs a better name/description in the tool definition

**Router updates:**
- Add 'decompose' intent to classifyIntent() for when user pastes large text blocks
- Research agent should be able to create research nodes (not just webcards)

**System prompt updates:**
- Describe research nodes and decomposition in the AI context
- When canvas has research nodes, include their topics in the context

**Changes:**
- `client/src/ai/tools.ts` → add decompose_text, generate_image
- `client/src/ai/executeToolCall.ts` → handle new tools
- `client/src/ai/router.ts` → update intent classification
- `client/src/ai/systemPrompt.ts` → describe new node types in context
- `client/src/ai/agents/canvasEditor.ts` → include new tools

---

## Implementation Order

### Phase 1: Navigation (F1 + F2)
Breadcrumbs and "every node opens." This unlocks the recursive model that everything else depends on.
- Add breadcrumb UI
- Generalize double-click → open for all element types
- Lazy document creation on first open

### Phase 2: HTML Wireframe Thumbnails (F3)
Scaled iframe previews on canvas. Quick win — most code exists.
- Iframe preview in DocumentCardRenderer
- Browser chrome styling

### Phase 3: Decomposition Pipeline (F4 + F5)
The big new feature. Server endpoint, LLM prompt, new element type, source viewer.
- DB migration for metadata
- Server decompose endpoint
- DecompositionCardElement + renderer
- Source text panel
- Research node surface appearance

### Phase 4: Image Generation (F6)
Server endpoint, OpenAI integration, AI tool.
- Image generation endpoint
- generate_image tool
- Wire into agent

### Phase 5: AI Integration (F7)
Connect everything through the agent. One prompt, multiple outputs.
- New tools in agent
- Router updates
- System prompt updates

---

## Out of Scope (for now)
- Google Docs API integration (use paste for now)
- Knowledge graph / cross-document entity extraction
- Query-adaptive view reshuffling
- Vector search / embeddings
- Real-time collaboration on research nodes
- Export / sharing of research boards
