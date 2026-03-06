import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

export interface AgentJob {
  id: string
  document_id: string | null
  user_id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stalled' | 'cancelled'
  input: Record<string, unknown>
  progress: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  max_attempts: number
  locked_by: string | null
  locked_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type CreateJobInput = {
  user_id: string
  type: string
  input: Record<string, unknown>
  document_id?: string
  max_attempts?: number
}

function getSupabase(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`

// ── Create ──

export async function createJob(opts: CreateJobInput): Promise<AgentJob> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_jobs')
    .insert({
      user_id: opts.user_id,
      type: opts.type,
      input: opts.input,
      document_id: opts.document_id || null,
      max_attempts: opts.max_attempts ?? 3,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create job: ${error.message}`)
  return data as AgentJob
}

// ── Read ──

export async function getJob(jobId: string): Promise<AgentJob | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw new Error(`Failed to get job: ${error.message}`)
  return data as AgentJob | null
}

export async function getJobForUser(jobId: string, userId: string): Promise<AgentJob | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Failed to get job: ${error.message}`)
  return data as AgentJob | null
}

// ── Claim (FOR UPDATE SKIP LOCKED via RPC) ──
// Supabase JS doesn't support FOR UPDATE SKIP LOCKED directly,
// so we use a two-step approach: find pending, then atomically lock it.

export async function claimNextJob(types?: string[]): Promise<AgentJob | null> {
  const supabase = getSupabase()

  // Find oldest pending job
  let query = supabase
    .from('agent_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (types && types.length > 0) {
    query = query.in('type', types)
  }

  const { data: candidates, error: findError } = await query

  if (findError) throw new Error(`Failed to find jobs: ${findError.message}`)
  if (!candidates || candidates.length === 0) return null

  const candidate = candidates[0]

  // Atomically claim it (only if still pending)
  const { data: claimed, error: claimError } = await supabase
    .from('agent_jobs')
    .update({
      status: 'running',
      locked_by: WORKER_ID,
      locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      attempts: candidate.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidate.id)
    .eq('status', 'pending')  // optimistic lock — only works if still pending
    .select()
    .maybeSingle()

  if (claimError) throw new Error(`Failed to claim job: ${claimError.message}`)
  if (!claimed) return null  // someone else grabbed it

  return claimed as AgentJob
}

// ── Update progress ──

export async function updateJobProgress(
  jobId: string,
  progress: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('agent_jobs')
    .update({
      progress,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'running')  // only update if still running

  if (error) throw new Error(`Failed to update progress: ${error.message}`)
}

// ── Complete ──

export async function completeJob(
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('agent_jobs')
    .update({
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (error) throw new Error(`Failed to complete job: ${error.message}`)
}

// ── Fail ──

export async function failJob(jobId: string, errorMsg: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('agent_jobs')
    .update({
      status: 'failed',
      error: errorMsg,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (error) throw new Error(`Failed to fail job: ${error.message}`)
}

// ── Cancel ──

export async function cancelJob(jobId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('agent_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['pending', 'running'])
    .select()
    .maybeSingle()

  if (error) throw new Error(`Failed to cancel job: ${error.message}`)
  return data !== null
}

// ── Stall detection (reaper) ──

const STALL_THRESHOLD_MS = 2 * 60 * 1000  // 2 minutes

export async function reapStalledJobs(): Promise<number> {
  const supabase = getSupabase()
  const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS).toISOString()

  // Find stalled jobs
  const { data: stalled, error: findError } = await supabase
    .from('agent_jobs')
    .select('id, attempts, max_attempts')
    .eq('status', 'running')
    .lt('updated_at', cutoff)

  if (findError) throw new Error(`Failed to find stalled jobs: ${findError.message}`)
  if (!stalled || stalled.length === 0) return 0

  let reaped = 0
  for (const job of stalled) {
    const canRetry = job.attempts < job.max_attempts
    const { error } = await supabase
      .from('agent_jobs')
      .update({
        status: canRetry ? 'pending' : 'stalled',
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'running')  // only if still running

    if (!error) reaped++
  }

  return reaped
}
