# Muse

Collaborative drawing canvas with real-time sync, user auth, and AI integration.

## Stack

- **Client**: React 19, Vite, TypeScript, Yjs + y-websocket
- **Server**: Node, Express, WebSocket (ws), Yjs persistence (Supabase)
- **Auth**: Supabase (local Docker instance), JWTs verified via JWKS (ES256)
- **AI**: Anthropic SDK, server-side proxy with encrypted API key storage

## Architecture

```
Browser → Supabase Auth (login) → JWT
Browser → WS + JWT → Server (verify via JWKS) → Yjs collab
Browser → HTTP + JWT → Server → /api/keys (AES-256-GCM encrypted, stored in Supabase)
Browser → HTTP + JWT → Server → /api/ai/message (decrypt key, call Anthropic, SSE stream)
```

## Commands

```
make setup            # start local Supabase + generate .env files
make dev              # start client + server
make validate         # typecheck + tests (run before committing)
make test             # server unit tests
make typecheck        # tsc both workspaces
make test-ui          # UI tests (Playwright, no backend needed)
make test-ui-open     # UI tests with Playwright interactive mode
make test-integration # integration tests (requires local Supabase)
make db-reset         # wipe and re-migrate local DB
make clean            # stop Supabase
```

## Project layout

```
client/src/
  auth/           AuthContext, LoginPage
  collab/         Yjs provider + context (passes JWT for WS auth)
  components/     Canvas, Toolbar, StatusBar, SettingsPanel, AiPanel
  hooks/          useElements, useCursors, useConnection, useDrawingId
  lib/            Supabase client

server/src/
  app.ts          createApp() — Express + WS + JWT verification
  index.ts        Entry point (dotenv + listen)
  crypto.ts       AES-256-GCM encrypt/decrypt
  routes/keys.ts  API key CRUD (encrypted at rest in user_secrets table)
  routes/ai.ts    Anthropic proxy (decrypt key, stream response)

server/test/
  ws.test.ts           WS + HTTP auth tests (uses HS256 test JWTs)
  drawings.test.ts     Drawing CRUD route tests
  persistence.test.ts  Yjs persistence tests (mock Supabase)
  ai.test.ts           AI proxy route tests

e2e/
  ui.config.ts         Playwright config for UI tests (no backend)
  integration.config.ts Playwright config for integration tests
  ui/                   UI-only tests (mocked auth via TestRoot)
  integration/          Full-stack tests (real Supabase + server)

supabase/migrations/
  001_init.sql    drawings + user_secrets tables with RLS
  002_drawing_content.sql  bytea column for Yjs doc content
```

## Testing

Three test layers:
- **Server unit tests** (`make test`): Node-only, mock Supabase via HTTP. Fast.
- **UI tests** (`make test-ui`): Playwright + Vite, mocked auth (TestRoot), no backend. Tests canvas interactions.
- **Integration tests** (`make test-integration`): Playwright + real server + real Supabase Docker. Tests persistence, auth, full flows.

CI runs all three in parallel (`.github/workflows/ci.yml`).

## Canvas architecture

### How elements are stored

All drawing elements (shapes, freehand paths, connectors) live in a shared Yjs document. Think of it as a shared array of dictionaries that automatically syncs between all connected browsers.

The array is called `'elements'`. Each element is a `Y.Map` — a flat dictionary of key-value pairs. There's no nesting. The allowed value types are `string | number | number[]` (called `YMapVal` in the code).

**Important: Yjs can't store booleans.** We use `0` for false and `1` for true. When reading them back, we cast: `(m.get('arrowEnd') as unknown as boolean) ?? true`.

There are three kinds of elements:

**ShapeElement** — A rectangle, ellipse, or diamond on the canvas.
```
id, type ('rectangle'|'ellipse'|'diamond'), x, y, width, height,
text (string inside the shape), fill (hex color), stroke (hex color), strokeWidth (number)
```

**PathElement** — A freehand drawing stroke.
```
id, type ('path'), x, y,
points (flat array: [x0, y0, x1, y1, ...]),
stroke, strokeWidth
```

**LineElement** — A connector or arrow between shapes (or free-floating).
```
id, type ('line'),
startShapeId, endShapeId     ← which shapes it's attached to ('' means free endpoint)
startAnchor, endAnchor       ← which side of the shape ('top'|'right'|'bottom'|'left')
startX, startY, endX, endY   ← world coordinates (used when endpoint is free)
stroke, strokeWidth,
arrowStart (0|1), arrowEnd (0|1),   ← whether to draw arrowheads
lineType ('straight'|'elbow'|'curve')
```

The `line` tool always connects two shapes — both endpoints must land on a shape or nothing is created. The `arrow` tool is more flexible: either or both endpoints can be free-floating (just a point in space, not attached to a shape).

When reading elements from Yjs, `readElement()` in `useElements.ts` fills in defaults for any missing fields. This is how we handle backward compatibility — old data that was saved before a field existed still loads correctly. The defaults: `fill→'#ffffff'`, `stroke→'#4f46e5'`, `strokeWidth→1.5`, `arrowEnd→true`, `arrowStart→false`, `lineType→'straight'`.

### Which component does what

**Canvas.tsx** is the boss. It handles all mouse events and decides what happens based on the active tool. When you click and drag, Canvas.tsx figures out whether you're creating a shape, drawing a freehand path, connecting two shapes, panning the canvas, selecting things, or marquee-selecting multiple things. It's the biggest file (~660 lines) and the most complex. It passes `selectedIds: string[]` as a prop — this is an array because you can select multiple shapes at once.

**ShapeRenderer.tsx** handles a single shape. It draws the SVG outline (rect/ellipse/diamond), shows a textarea for editing text, and handles drag-to-move and resize. When a shape is selected in select mode, it shows 8 resize handles (one on each corner and one on each edge midpoint). It tells Canvas when the user clicks it (with shift key info for multi-select).

**LineLayer.tsx** draws all the connectors/arrows. For each connector, it figures out where the endpoints are — if attached to a shape, it calculates the anchor point on that shape; if free-floating, it uses the stored coordinates. It renders SVG `<path>` elements (not `<line>` — paths support curves and elbows). Each connector gets its own arrowhead marker definition, colored to match that connector's stroke.

**PathLayer.tsx** draws freehand strokes as SVG polylines. Simple.

**PropertyPanel.tsx** is the floating panel that appears when you select something. It shows fill color, stroke color, stroke width, and (for connectors) line type. It uses native `<input type="color">` pickers. It only appears for single selection right now.

**Toolbar.tsx** renders the tool buttons. Each button has `data-testid="tool-{name}"`. When the line or arrow tool is active, it also shows a sub-selector for line type (straight/elbow/curve).

**useElements.ts** is the only file that talks to Yjs. It provides functions to create, update, and delete elements. When you delete a shape, it also deletes all connectors that were attached to that shape (cascade delete). The deletion has to happen in reverse index order — if you delete index 5, then index 3, that's fine. But if you delete index 3 first, what was at index 5 is now at index 4, and you'd delete the wrong thing.

### How things look (CSS and DOM conventions)

Every shape is a `<div class="shape">` absolutely positioned inside the canvas world container. When selected, it gets `class="shape shape--selected"`. Inside each shape div: an `<svg class="shape__outline">` for the visual outline, a `<textarea class="shape__text">` for the label.

Resize handles are small `<div class="resize-handle">` elements with `data-handle="nw"` (or n, ne, e, se, s, sw, w). They're positioned at corners and edge midpoints.

Connectors are `<path class="connector">` inside an SVG with class `canvas__lines`. Arrowhead markers are defined per-connector as `arrowhead-end-{id}`.

The whole canvas pans and zooms via a wrapper div `<div class="canvas__world">` that has a CSS transform: `translate(Xpx, Ypx) scale(Z)`.

Test IDs follow the pattern `data-testid="tool-rectangle"`, `data-testid="shape-ellipse"`, `data-testid="canvas"`. Shape elements also carry `data-shape-id="{uuid}"` for identification.

### Traps that will bite you

**1. Stale closures during drag operations.** This is the #1 bug source. When the user starts a drag (mousedown), React captures the current state values in the event handler closure. By the time mouseup fires, the state has changed but the handler still sees the old values. **Fix: use refs for anything that changes during a drag, or recompute the value from the mouse event coordinates in mouseup.** We hit this with marquee selection — `marquee` state was stale in handleMouseUp, so we compute the final rect from `marqueeStart` ref + mouse position instead.

**2. Selected shapes change their own appearance.** When a shape is selected, ShapeRenderer thickens its stroke by +0.5px and changes the stroke color to indigo. This means if you just set `stroke: '#ff0000'` and then check what's rendered in the DOM while the shape is still selected, you'll see indigo, not red. **Fix: any test that checks rendered SVG attributes (fill, stroke, stroke-width) must deselect the shape first** by clicking empty canvas at `(600, 50)`.

**3. Don't use Escape to deselect in tests.** Pressing Escape seems like the obvious way to deselect, but if a textarea or input is focused, the Escape keypress gets eaten by that element and never reaches the app-level keyboard handler. **Fix: click on empty canvas space instead** — `page.mouse.click(600, 50)`.

**4. Yjs booleans are numbers.** If you write `yEl.set('arrowEnd', true)`, Yjs silently stores... something unpredictable. Always write `yEl.set('arrowEnd', 1)` and read with a cast.

**5. Cascade delete must go in reverse.** When deleting a shape and its attached connectors, collect all the array indices, sort them descending, then delete one by one. If you delete from front to back, each deletion shifts all subsequent indices down by one and you corrupt the data.

### Feature register and test-driven workflow

`FEATURES.md` has every feature we want, marked `[x]` shipped, `[~]` partial, or `[ ]` missing.

Each missing feature has a corresponding `test.fixme()` in the `e2e/ui/` test files. These are real Playwright tests with real selectors and assertions — they just skip automatically because `.fixme` tells Playwright "I know this doesn't work yet."

**To implement a feature:**
1. Find the `test.fixme()` for it
2. Read the test to understand what the user interaction should look like and what the assertions expect
3. Write the code
4. Remove the `.fixme` — the test is now a normal test
5. Run `npm run test:ui` — if it passes, the feature works

Run `npm run test:ui` to see the current scoreboard. Right now: 74 passing, 182 fixme-skipped.

## Current state

Auth, encrypted key storage, AI proxy, and Supabase persistence are implemented.
Canvas collab works. Drawing content and titles persist across navigation.
Login gates access. WS connections are JWT-verified.

Canvas has: shapes (rect/ellipse/diamond), freehand drawing, connectors (straight/elbow/curve), arrows (free-floating + attached), property panel (fill/stroke/width/lineType), resize handles, multi-select (shift-click + marquee), cascade delete.

74 UI tests passing, 182 fixme-skipped (unimplemented features), 32 server tests passing.

## What's next

- Implement features from FEATURES.md (182 fixme tests define the spec)
- Wire AI responses into the canvas (diagram-editing agent)
- Share/invite flow for collaborative rooms
- Production deployment (WSS, real Supabase project, proper CORS)
