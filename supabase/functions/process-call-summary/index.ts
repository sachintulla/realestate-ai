// supabase/functions/process-call-summary/index.ts
//
// Extracts a structured summary from a call transcript (via Claude) after a
// call ends, saves it, and auto-schedules the next callback when the lead is
// still live.
//
// STUB — Phase 0 scaffold only. The full implementation is specified verbatim
// in docs/AI_BUILD_GUIDE.md §6.2 and lands in Phase 2.

import { serve } from "https://deno.land/std/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "Not implemented — see docs/AI_BUILD_GUIDE.md §6.2 (Phase 2)",
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  ),
);
