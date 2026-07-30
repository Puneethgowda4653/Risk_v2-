-- ============================================================
-- Payment sessions: tracks Razorpay payment state per checkout
-- session so the "paid" flag survives page refreshes.
-- Run this in your Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_sessions (
  order_id    TEXT PRIMARY KEY,          -- Razorpay order id (unique per order)
  session_id  TEXT NOT NULL,             -- our app session id (from /api/start)
  email       TEXT,
  payment_id  TEXT,                      -- Razorpay payment id once paid
  paid        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  updated_at  TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_session ON payment_sessions(session_id);

-- Allow the anon key used by the backend to read/write (matches the
-- permissive policy pattern used for users/assessments).
ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to payment_sessions" ON payment_sessions;
CREATE POLICY "Allow all access to payment_sessions" ON payment_sessions
  FOR ALL USING (true) WITH CHECK (true);
