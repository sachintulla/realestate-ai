// Service-role Supabase client — bypasses RLS. SERVER-ONLY.
//
// Admin screens are intentionally cross-tenant, so they read/write with the
// service role. This is safe ONLY because every admin route and server action
// is gated by requireAdmin() (see lib/auth.ts) on top of the middleware role
// check. Never import this into a Client Component.

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE URL or SUPABASE_SERVICE_ROLE_KEY for service client",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
