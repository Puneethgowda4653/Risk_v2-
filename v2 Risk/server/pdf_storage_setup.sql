-- ============================================================
-- PDF STORAGE SETUP FOR SUPABASE
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create the pdf_reports table to track uploaded PDFs
CREATE TABLE IF NOT EXISTS pdf_reports (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_email VARCHAR(255) NOT NULL,
  assessment_id BIGINT REFERENCES assessments(id) ON DELETE SET NULL,
  filename VARCHAR(500) NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  file_size INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_pdf_reports_user_email ON pdf_reports(user_email);
CREATE INDEX IF NOT EXISTS idx_pdf_reports_assessment_id ON pdf_reports(assessment_id);
CREATE INDEX IF NOT EXISTS idx_pdf_reports_created_at ON pdf_reports(created_at DESC);

-- 3. Enable RLS (Row Level Security)
ALTER TABLE pdf_reports ENABLE ROW LEVEL SECURITY;

-- 4. Create permissive policies for the anon key (since we're using server-side auth)
-- Allow inserts from the server
CREATE POLICY "Allow insert for anon" ON pdf_reports
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow reads from the server
CREATE POLICY "Allow select for anon" ON pdf_reports
  FOR SELECT TO anon
  USING (true);

-- ============================================================
-- STORAGE BUCKET SETUP
-- You MUST also create the storage bucket via Dashboard:
--
-- 1. Go to Supabase Dashboard > Storage
-- 2. Click "New Bucket"
-- 3. Name it: pdf-reports
-- 4. Make it PUBLIC (toggle on)
-- 5. Click "Create Bucket"
--
-- Then add a Storage Policy:
-- 1. Click the "pdf-reports" bucket
-- 2. Go to "Policies" tab
-- 3. Add a new policy:
--    - Policy name: "Allow public uploads"
--    - Allowed operation: INSERT
--    - Target roles: anon
--    - WITH CHECK expression: true
-- 4. Add another policy:
--    - Policy name: "Allow public reads"
--    - Allowed operation: SELECT  
--    - Target roles: anon
--    - USING expression: true
-- ============================================================
