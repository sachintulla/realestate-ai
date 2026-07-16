// supabase/functions/dispatch-callbacks/index.ts
//
// The automatic re-dial loop. Runs on a pg_cron schedule (see cron.sql),
// finds every due scheduled_callback, fires trigger-call for each, and marks
// them triggered/completed.
//
// STUB — Phase 0 scaffold only. The full implementation is specified verbatim
// in docs/AI_BUILD_GUIDE.md §6.3 and lands in Phase 2.

import { serve } from "https://deno.land/std/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "Not implemented — see docs/AI_BUILD_GUIDE.md §6.3 (Phase 2)",
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  ),
);
