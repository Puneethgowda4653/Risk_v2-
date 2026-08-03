const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Prefer the service-role key so the backend can access the database after RLS
// is locked down to deny the public anon role. Falls back to the anon key so
// the server still runs before the service key is configured.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env');
} else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ Using SUPABASE_ANON_KEY. Set SUPABASE_SERVICE_ROLE_KEY and lock down RLS for proper access control.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = supabase;
