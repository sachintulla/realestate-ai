// supabase/functions/dispatch-callbacks/index.ts
//
// Runs on a schedule (see cron.sql below). Finds every scheduled_callback
// that's now due, fires trigger-call for it, and marks it triggered.
// This is the piece that makes "call me later" actually happen without
// anyone touching a dashboard.

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (_req) => {
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_callbacks")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_time", now)
    .limit(50); // batch size per run

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const results = [];
  for (const cb of due ?? []) {
    // Mark triggered first to avoid double-dialing if this run overlaps the next
    await supabase.from("scheduled_callbacks")
      .update({ status: "triggered", attempt_count: cb.attempt_count + 1 })
      .eq("id", cb.id);

    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/trigger-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        customer_id: cb.customer_id,
        business_id: cb.business_id,
        lead_id: cb.lead_id,
      }),
    });
    results.push({ callback_id: cb.id, ok: resp.ok });

    if (resp.ok) {
      await supabase.from("scheduled_callbacks").update({ status: "completed" }).eq("id", cb.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, dispatched: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
