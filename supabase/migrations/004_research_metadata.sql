-- Add metadata column for research decomposition results
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata jsonb;
-- Add source_text column for original ingested text (separate from content which is used for HTML artifacts)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_text text;
