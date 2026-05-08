import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for trusted server-side operations
 * (e.g. looking up a user's own profile after the session has already
 * been validated by getUser()). Bypasses RLS — never expose to the
 * client and never use with untrusted input.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "createAdminClient: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
