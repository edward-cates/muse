-- AI features: chat persistence and agent jobs

CREATE TABLE ai_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Chat',
  encrypted_messages text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access" ON ai_chats FOR ALL USING (false);
CREATE INDEX idx_ai_chats_owner ON ai_chats (owner_id, updated_at DESC);

CREATE TABLE agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  type text NOT NULL,              -- 'research' | 'compose' | 'canvas_edit'
  status text NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed | stalled | cancelled
  input jsonb NOT NULL DEFAULT '{}',
  progress jsonb NOT NULL DEFAULT '{}',
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access" ON agent_jobs FOR ALL USING (false);
CREATE INDEX idx_agent_jobs_claimable ON agent_jobs (status, created_at) WHERE status IN ('pending', 'running');
CREATE INDEX idx_agent_jobs_user ON agent_jobs (user_id, created_at DESC);
