-- ============================================================
-- CRITICAL: Lock down Row Level Security.
--
-- Removes the permissive "allow all" policies that let anyone holding the
-- public anon key read/modify all data. After this, the anon role is denied
-- direct table access; the backend keeps working because it uses the
-- SERVICE-ROLE key (which bypasses RLS).
--
-- ⚠️ RUN ORDER (do NOT run this first, or the live app will break):
--   1. Add SUPABASE_SERVICE_ROLE_KEY to the server (Render) env.
--   2. Redeploy the server and confirm it works.
--   3. THEN run this file in the Supabase SQL Editor.
-- ============================================================

-- Tables: drop the permissive policies. RLS stays ENABLED, so with no policy
-- the anon/authenticated roles are denied; the service role bypasses RLS.
DROP POLICY IF EXISTS "Allow all access to users" ON users;
DROP POLICY IF EXISTS "Allow all access to assessments" ON assessments;
DROP POLICY IF EXISTS "Allow all access to payment_sessions" ON payment_sessions;
DROP POLICY IF EXISTS "Allow insert for anon" ON pdf_reports;
DROP POLICY IF EXISTS "Allow select for anon" ON pdf_reports;

-- Make sure RLS is enabled everywhere (it should already be).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_reports ENABLE ROW LEVEL SECURITY;

-- Storage: remove anon upload rights (the backend uploads via the service role).
-- Buckets stay public for READ so getPublicUrl() links keep working.
DROP POLICY IF EXISTS "dashboard-images anon insert" ON storage.objects;
-- If you created anon INSERT policies for the pdf-reports bucket via the
-- dashboard, drop them too, e.g.:
--   DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;

-- NOTE: keep the "dashboard-images anon read" policy (or the bucket's public
-- flag) so images remain viewable. For stronger privacy, make the buckets
-- private and switch the backend to signed URLs instead of getPublicUrl().
