const { createClient } = require('@supabase/supabase-js');

let _client = null;

/**
 * PUBLIC_INTERFACE
 * getSupabaseClient
 * Returns a singleton Supabase client configured from environment variables.
 *
 * Required env vars (already present in this project):
 * - SUPABASE_URL
 * - SUPABASE_KEY
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabaseClient() {
  if (_client) return _client;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Fail fast with a clear error; avoids confusing runtime errors later.
    throw new Error(
      'Supabase is not configured. Please set SUPABASE_URL and SUPABASE_KEY in the backend environment.'
    );
  }

  _client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return _client;
}

module.exports = {
  getSupabaseClient,
};
