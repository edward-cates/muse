import { Router } from 'express'
import { createJob, getJobForUser, cancelJob } from '../jobs.js'

const router = Router()

const VALID_JOB_TYPES = ['research', 'compose', 'canvas_edit']

// POST /api/jobs — create a new agent job
router.post('/', async (req, res) => {
  const userId = req.userId!
  const { type, input, document_id } = req.body

  if (!type || typeof type !== 'string') {
    res.status(400).json({ error: 'type is required' })
    return
  }
  if (!VALID_JOB_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid job type. Must be one of: ${VALID_JOB_TYPES.join(', ')}` })
    return
  }
  if (!input || typeof input !== 'object') {
    res.status(400).json({ error: 'input object is required' })
    return
  }

  try {
    const job = await createJob({
      user_id: userId,
      type,
      input,
      document_id,
    })
    res.json({ jobId: job.id, status: job.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create job'
    res.status(500).json({ error: message })
  }
})

// GET /api/jobs/:id — get job status and progress
router.get('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params

  try {
    const job = await getJobForUser(id, userId)
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }
    res.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      attempts: job.attempts,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      updated_at: job.updated_at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get job'
    res.status(500).json({ error: message })
  }
})

// POST /api/jobs/:id/cancel — cancel a pending or running job
router.post('/:id/cancel', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params

  try {
    // Verify the job belongs to this user first
    const job = await getJobForUser(id, userId)
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    if (job.status !== 'pending' && job.status !== 'running') {
      res.status(409).json({ error: `Cannot cancel job with status "${job.status}"` })
      return
    }

    const cancelled = await cancelJob(id)
    if (!cancelled) {
      res.status(409).json({ error: 'Job status changed before cancellation' })
      return
    }
    res.json({ success: true, status: 'cancelled' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel job'
    res.status(500).json({ error: message })
  }
})

export default router
