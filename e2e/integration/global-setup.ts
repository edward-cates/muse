import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

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

  writeFileSync(resolve(__dirname, '.auth-state.json'), JSON.stringify(storageState, null, 2))
}
