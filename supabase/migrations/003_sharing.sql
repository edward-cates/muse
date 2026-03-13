-- Document sharing

CREATE TABLE document_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  owner_id uuid REFERENCES auth.users(id) NOT NULL,
  shared_with_id uuid REFERENCES auth.users(id),
  shared_with_email text NOT NULL,
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz DEFAULT now(),
  UNIQUE(document_id, shared_with_email)
);

ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access" ON document_shares FOR ALL USING (false);

CREATE INDEX idx_document_shares_shared_with ON document_shares (shared_with_id);
CREATE INDEX idx_document_shares_email ON document_shares (shared_with_email);
CREATE INDEX idx_document_shares_document ON document_shares (document_id);
