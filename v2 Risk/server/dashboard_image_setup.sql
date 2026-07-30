-- ============================================================
-- Dashboard JPG storage.
-- Stores a rendered JPG of each user's dashboard in Supabase
-- Storage and its URL on the assessment row.
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- 1. Column that holds the public URL of the dashboard image.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS dashboard_image_url TEXT;

-- 2. Public storage bucket for the images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('dashboard-images', 'dashboard-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. Allow the anon key (used by the backend) to upload and read.
DROP POLICY IF EXISTS "dashboard-images anon insert" ON storage.objects;
CREATE POLICY "dashboard-images anon insert" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'dashboard-images');

DROP POLICY IF EXISTS "dashboard-images anon read" ON storage.objects;
CREATE POLICY "dashboard-images anon read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'dashboard-images');
