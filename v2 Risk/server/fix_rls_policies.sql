-- ============================================================
-- FIX: Add INSERT/UPDATE/DELETE policies so the anon key can 
-- actually write data. The original schema only had SELECT.
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- Drop the old restrictive SELECT policies (they require auth.uid which we don't use)
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can read own assessments" ON assessments;

-- Allow all operations via anon key (for development)
-- Users table
CREATE POLICY "Allow all access to users" ON users
  FOR ALL USING (true) WITH CHECK (true);

-- Assessments table
CREATE POLICY "Allow all access to assessments" ON assessments
  FOR ALL USING (true) WITH CHECK (true);
