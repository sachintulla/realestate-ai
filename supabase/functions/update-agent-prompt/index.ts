// supabase/functions/update-agent-prompt/index.ts
//
// Pushes a new system prompt to a business's Getello agent (PUT
// /api/agents/{agent_id}) and records it in agent_prompts for version
// history / rollback.
//
// STUB — Phase 0 scaffold only. The full implementation is specified verbatim
// in docs/AI_BUILD_GUIDE.md §6.4 and lands in Phase 2.

import { serve } from "https://deno.land/std/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "Not implemented — see docs/AI_BUILD_GUIDE.md §6.4 (Phase 2)",
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  ),
);
