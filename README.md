# Muse

**An AI-native thinking environment — a spatial canvas where the AI is a first-class collaborator, not just a chatbot sidebar that can drop shapes.**

The canvas is the shared workspace between you and the AI. The agent can diagram, research, generate images, and organize — and you can manually rearrange, annotate, draw, and refine everything it produces. This is not AI thinking and human ingesting. It's a back-and-forth collaboration where both sides contribute visually.

## Product vision

Three capabilities converge on the canvas:

- **Diagramming & layout** — Both the human and the AI structure thinking visually. Flowcharts, architectures, concept maps, wireframes. The drawing tools are first-class — humans need to draw stuff and see drawings.
- **Research & knowledge collection** — The AI goes out, finds information, and brings it back onto the canvas as source cards you can spatially organize. Users can also paste links and have the AI read, summarize, and integrate them. The canvas becomes a knowledge graph.
- **Generative media** — AI-generated images (via OpenAI) and HTML wireframes that live as nodes on the board, enriching it beyond boxes and arrows.

Muse is a spatial AI research and thinking tool where the canvas is the medium, not just the output.

## Architecture vision

### Nodes are recursive containers (Notion-style)

Every element on the canvas is a lightweight spatial shell that can hold rich content. A node defines its position, size, and visual style on the canvas. Its content can be anything:

| Content type | What it holds | Entry points |
|-------------|---------------|--------------|
| **Shape** | Rectangle, ellipse, diamond with text label | Draw with tools |
| **Image** | AI-generated or user-uploaded image | Agent generates, user drags in |
| **Web source** | URL, title, snippet, extracted page content | Agent researches, user pastes link |
| **HTML wireframe** | Sandboxed HTML/CSS rendered inline | Agent generates |
| **Sub-canvas** | A nested drawing you can navigate into | User or agent creates |
| **Text/note** | Long-form text, markdown, research summary | User types, agent summarizes |

At the canvas level, every node looks like a card you can move, resize, connect, and arrange. Click into it and you get the full content — a detail view, not semantic zoom. The spatial layout is the map; each node is a door you can walk through.

### Agent architecture: Router + subagents

The AI uses a router pattern. The top-level agent decides what kind of work to do, then delegates to focused subagents:

| Subagent | Responsibility | Tools |
|----------|---------------|-------|
| **Canvas editor** | Spatial manipulation — create, move, resize, connect, layout | `add_shape`, `update_element`, `delete_element`, `add_line`, layout algorithms |
| **Researcher** | Web search, link reading, source synthesis | Anthropic web search, URL fetching, source card creation |
| **Image generator** | Generate images from descriptions | OpenAI image generation API |
| **Content elaborator** | Navigate into a node, expand/edit its content | Read/write node content |

Each subagent gets a focused system prompt and minimal tool set. The router can chain operations: "research X, then diagram the findings, then generate a cover image."

### Canvas informs AI context (RAG)

The canvas graph — which nodes exist, how they're connected, what content they hold — serves as context for the agent. When the user asks a question, the agent can read the board's structure and content to give spatially-aware, context-rich answers. The canvas *is* the knowledge base.

### API keys

Users provide their own keys, encrypted at rest (AES-256-GCM) in Supabase:
- **Anthropic key** — powers the AI agent (Claude)
- **OpenAI key** — powers image generation (DALL-E / GPT-image-1)

## Current state

### What works today
- Canvas with shapes (rect/ellipse/diamond), freehand drawing, connectors (straight/elbow/curve), arrows
- Property panel (fill/stroke/width/lineType), resize handles, multi-select, cascade delete
- Real-time collaboration via Yjs + WebSocket
- Supabase auth, encrypted API key storage, AI chat panel
- Basic AI agent with 4 tools (add_shape, update_element, delete_element, add_line)
- 10-turn agentic loop with streaming SSE
- 74 UI tests passing, 182 fixme-skipped, 32 server tests passing

### What the AI agent lacks
- Missing tool parameters: fill color, arrowheads, lineType, free-floating endpoints
- No layout algorithm tools (the AI must compute all coordinates manually)
- No spatial reasoning guidance in prompts
- No screenshot/visual perception of the canvas
- No web research capability
- No image generation
- No rich node types (images, web cards, HTML)
- Single flat agent (no router/subagent pattern)

## Roadmap

### Phase 1: Make the diagram agent solid
Expand tool schemas (fill, arrows, lineType). Improve system prompt with layout templates and spatial reasoning instructions. Add sanitization layer. Make the existing canvas manipulation reliable before layering new capabilities on top.

### Phase 2: Rich node types + image generation
Design the content-reference node model. Add image elements to the canvas. OpenAI key storage. Give the agent a `generate_image` tool. First "wow" moment beyond a drawing tool.

### Phase 3: Research agent
Anthropic web search integration. URL paste-to-summarize. Source card element type. Layout algorithm tools for arranging research results. This is the core differentiator.

### Phase 4: HTML wireframes + content depth
HTML-in-node rendering (sandboxed iframe). Click-to-open detail views for any node. Sub-canvas navigation. The recursive container model comes to life.

### Phase 5: RAG-informed agent context
Graph-aware context assembly. The agent reads the board's structure and content to answer questions. The canvas becomes a living knowledge base.

## Stack

- **Client**: React 19, Vite, TypeScript, Yjs + y-websocket
- **Server**: Node, Express, WebSocket (ws), Yjs persistence (Supabase)
- **Auth**: Supabase (local Docker instance), JWTs verified via JWKS (ES256)
- **AI**: Anthropic SDK (agent), OpenAI SDK (image generation)
- **Storage**: Supabase Postgres + Supabase Storage (images)

## Development

See [CLAUDE.md](./CLAUDE.md) for full development guide, commands, and canvas architecture docs.

```
make setup            # start local Supabase + generate .env files
make dev              # start client + server
make validate         # typecheck + tests (run before committing)
make test             # server unit tests
make test-ui          # UI tests (Playwright)
make test-integration # integration tests (requires local Supabase)
```
