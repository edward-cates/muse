-- Documents are flat; links between them are canvas card elements, not DB hierarchy
ALTER TABLE documents DROP COLUMN IF EXISTS parent_id;
