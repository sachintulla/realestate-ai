// supabase/functions/trigger-call/index.ts
//
// Places a Getello call with full memory of prior calls.
//
// STUB — Phase 0 scaffold only. The full implementation (assemble
// context_data from lead + last call summary, read the Getello key from
// Supabase Vault, POST to the Getello /calls endpoint, log the call) is
// specified verbatim in docs/AI_BUILD_GUIDE.md §6.1 and lands in Phase 2.

import { serve } from "https://deno.land/std/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "Not implemented — see docs/AI_BUILD_GUIDE.md §6.1 (Phase 2)",
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  ),
);
