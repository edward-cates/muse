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

## Current state

Auth, encrypted key storage, AI proxy, and Supabase persistence are implemented.
Canvas collab works. Drawing content and titles persist across navigation.
Login gates access. WS connections are JWT-verified. Tests pass.

## What's next

- Wire AI responses into the canvas (diagram-editing agent)
- Share/invite flow for collaborative rooms
- Production deployment (WSS, real Supabase project, proper CORS)
