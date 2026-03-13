import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes, createCipheriv } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function encryptApiKey(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

// Playwright runs global setup from the repo root (process.cwd())
const PROJECT_ROOT = process.cwd()
const INTEGRATION_DIR = resolve(PROJECT_ROOT, 'e2e/integration')

function readEnvFile(path: string): Record<string, string> {
  const content = readFileSync(path, 'utf-8')
  const env: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (match) env[match[1]] = match[2]
  }
  return env
}

export default async function globalSetup() {
  const serverEnv = readEnvFile(resolve(PROJECT_ROOT, 'server/.env'))
  const clientEnv = readEnvFile(resolve(PROJECT_ROOT, 'client/.env.local'))

  const supabaseUrl = serverEnv.SUPABASE_URL
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = clientEnv.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error(
      'Missing Supabase env vars. Run `make setup` first.\n' +
      `  SUPABASE_URL=${supabaseUrl || '(missing)'}\n` +
      `  SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey ? '(set)' : '(missing)'}\n` +
      `  VITE_SUPABASE_ANON_KEY=${anonKey ? '(set)' : '(missing)'}`,
    )
  }

  // Create test user via admin API (ignore "already exists" errors)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { error: createError } = await admin.auth.admin.createUser({
    email: 'test@integration.local',
    password: 'test-password-123',
    email_confirm: true,
  })
  if (createError && !createError.message.includes('already been registered')) {
    throw new Error(`Failed to create test user: ${createError.message}`)
  }

  // Sign in as test user to get a session
  const client = createClient(supabaseUrl, anonKey)
  const { data, error } = await client.auth.signInWithPassword({
    email: 'test@integration.local',
    password: 'test-password-123',
  })
  if (error || !data.session) {
    throw new Error(`Auth setup failed: ${error?.message}`)
  }

  // Store a test API key in user_secrets so the server-side worker can decrypt it.
  // The mock Anthropic server will receive the calls instead of the real API.
  const encryptionKey = serverEnv.ENCRYPTION_KEY
  if (encryptionKey) {
    const userId = data.session.user.id
    const encryptedKey = encryptApiKey('test-mock-api-key', encryptionKey)
    await admin.from('user_secrets').upsert({
      user_id: userId,
      provider: 'anthropic',
      encrypted_key: encryptedKey,
    }, { onConflict: 'user_id,provider' })
  }

  // Create second test user for sharing tests
  const { error: createError2 } = await admin.auth.admin.createUser({
    email: 'test2@integration.local',
    password: 'test-password-456',
    email_confirm: true,
  })
  if (createError2 && !createError2.message.includes('already been registered')) {
    throw new Error(`Failed to create test user 2: ${createError2.message}`)
  }

  const client2 = createClient(supabaseUrl, anonKey)
  const { data: data2, error: error2 } = await client2.auth.signInWithPassword({
    email: 'test2@integration.local',
    password: 'test-password-456',
  })
  if (error2 || !data2.session) {
    throw new Error(`Auth setup for user 2 failed: ${error2?.message}`)
  }

  // Build Playwright storage state with Supabase session in localStorage.
  // Supabase JS stores session under: sb-{hostname-first-segment}-auth-token
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

  const storageState = {
    cookies: [],
    origins: [{
      origin: 'http://localhost:5175',
      localStorage: [{
        name: storageKey,
        value: JSON.stringify(data.session),
      }],
    }],
  }

  const storageState2 = {
    cookies: [],
    origins: [{
      origin: 'http://localhost:5175',
      localStorage: [{
        name: storageKey,
        value: JSON.stringify(data2.session),
      }],
    }],
  }

  writeFileSync(resolve(INTEGRATION_DIR, '.auth-state.json'), JSON.stringify(storageState, null, 2))
  writeFileSync(resolve(INTEGRATION_DIR, '.auth-state-user2.json'), JSON.stringify(storageState2, null, 2))
}
