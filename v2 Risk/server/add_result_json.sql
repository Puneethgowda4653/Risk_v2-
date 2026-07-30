-- ============================================================
-- Store the full dashboard/result object for each assessment so
-- the exact dashboard can be reloaded verbatim (not just
-- reconstructed from the summary columns).
-- Run this in your Supabase SQL Editor.
-- ============================================================

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS result_json JSONB;

-- Optional: snapshot of the metadata used for the assessment (company, stage…)
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS metadata_json JSONB;
