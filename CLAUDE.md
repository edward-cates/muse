# Muse

Collaborative drawing canvas with real-time sync, user auth, and AI integration.

## Stack

- **Client**: React 19, Vite, TypeScript, Yjs + y-websocket
- **Server**: Node, Express, WebSocket (ws), Yjs persistence (file-based)
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
make setup      # start local Supabase + generate .env files
make dev        # start client + server
make validate   # typecheck + tests (run before committing)
make test       # server tests only
make typecheck  # tsc both workspaces
make db-reset   # wipe and re-migrate local DB
make clean      # stop Supabase
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
  ws.test.ts      WS + HTTP auth tests (8 tests, uses HS256 test JWTs)

supabase/migrations/
  001_init.sql    drawings + user_secrets tables with RLS
```

## Current state

Auth, encrypted key storage, and AI proxy are implemented. Canvas collab works.
Login gates access. WS connections are JWT-verified. Tests pass.

## What's next

- Wire AI responses into the canvas (diagram-editing agent)
- Drawing ownership (tie drawings to users via the `drawings` table)
- Share/invite flow for collaborative rooms
- Production deployment (WSS, real Supabase project, proper CORS)
