import { useState, useEffect, useRef, useCallback } from 'react'
import { apiUrl } from '../lib/api'

export interface JobStatus {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stalled' | 'cancelled'
  progress: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

const POLL_INTERVAL_MS = 2500
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stalled', 'cancelled'])

export function useJobStatus(jobId: string | null, token: string | null): JobStatus | null {
  const [status, setStatus] = useState<JobStatus | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!jobId || !token) return
    try {
      const res = await fetch(apiUrl(`/api/jobs/${jobId}`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as JobStatus
        setStatus(data)
        // Stop polling on terminal status
        if (TERMINAL_STATUSES.has(data.status) && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } catch {
      // best-effort polling
    }
  }, [jobId, token])

  useEffect(() => {
    if (!jobId || !token) {
      setStatus(null)
      return
    }

    // Fetch immediately
    fetchStatus()

    // Start polling
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [jobId, token, fetchStatus])

  return status
}

/** Create a job and return the jobId */
export async function createJob(
  token: string,
  type: string,
  input: Record<string, unknown>,
  documentId?: string,
): Promise<string> {
  const res = await fetch(apiUrl('/api/jobs'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type, input, document_id: documentId }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Failed to create job')
  }
  const data = await res.json() as { jobId: string }
  return data.jobId
}

/** Cancel a running job */
export async function cancelJobRequest(token: string, jobId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/jobs/${jobId}/cancel`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Failed to cancel job')
  }
}
