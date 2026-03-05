-- Create documents table (replaces drawings) with document model columns.
-- Migrate existing data, then drop the old table.

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL DEFAULT 'Untitled',
  content text,
  type text NOT NULL DEFAULT 'canvas',
  parent_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  content_version integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own documents" ON documents
  FOR ALL USING (auth.uid() = owner_id);

-- Migrate existing drawings into documents
INSERT INTO documents (id, owner_id, title, content, created_at, updated_at)
  SELECT id, owner_id, title, content, created_at, updated_at FROM drawings;

-- Drop old table
DROP TABLE drawings;
