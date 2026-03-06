-- Core tables: documents and user secrets

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL DEFAULT 'Untitled',
  content text,                    -- Yjs binary (base64) for canvas, raw HTML for artifacts
  type text NOT NULL DEFAULT 'canvas',  -- 'canvas' | 'html_artifact' | 'research'
  content_version integer NOT NULL DEFAULT 0,
  metadata jsonb,                  -- research decomposition results, etc.
  source_text text,                -- original ingested text for research docs
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON documents
  FOR ALL USING (auth.uid() = owner_id);

CREATE TABLE user_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, provider)
);

ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access" ON user_secrets FOR ALL USING (false);
