// supabase/functions/process-call-summary/index.ts
//
// Call this when a call ends (Getello webhook, or your own polling job)
// with { call_id, transcript }. It uses Claude to extract a structured
// summary, saves it, and — if the customer asked for a callback or showed
// interest — automatically schedules the next call.
//
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { call_id, transcript } = await req.json();

    const { data: call, error: callErr } = await supabase
      .from("calls")
      .select("*, businesses(default_callback_hours)")
      .eq("id", call_id)
      .single();
    if (callErr || !call) throw new Error("Call not found");

    // Save raw transcript + mark completed
    await supabase.from("calls")
      .update({ raw_transcript: transcript, call_status: "completed", ended_at: new Date().toISOString() })
      .eq("id", call_id);

    const defaultHours = call.businesses?.default_callback_hours ?? 24;

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 600,
        messages: [{
          role: "user",
          content:
`Extract a structured summary from this sales call transcript.
Return ONLY valid JSON — no preamble, no markdown fences — in exactly this shape:

{
  "summary_text": string,
  "disposition": "interested" | "callback_requested" | "not_interested" | "converted" | "lost",
  "structured_data": {
    "interest_level": string,
    "budget_window": string,
    "project_size": string,
    "objections": string[],
    "sentiment": string
  },
  "next_action": string,
  "suggested_next_call_hours": number  // if the customer gave a cue ("call tomorrow",
                                        // "next week") reflect it in hours; otherwise use ${defaultHours}
}

Transcript:
${transcript}`
        }],
      }),
    });

    const claudeData = await claudeResp.json();
    const textBlock = claudeData.content?.find((b: { type: string }) => b.type === "text");
    const cleaned = (textBlock?.text ?? "{}").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const nextCallAt = new Date(
      Date.now() + (parsed.suggested_next_call_hours ?? defaultHours) * 3600 * 1000
    ).toISOString();

    await supabase.from("call_summaries").insert({
      call_id,
      summary_text: parsed.summary_text,
      structured_data: parsed.structured_data,
      disposition: parsed.disposition,
      next_action: parsed.next_action,
      next_call_at: nextCallAt,
    });

    // Auto-schedule the next call for anything still live in the pipeline
    if (["interested", "callback_requested"].includes(parsed.disposition)) {
      await supabase.from("scheduled_callbacks").insert({
        business_id: call.business_id,
        customer_id: call.customer_id,
        lead_id: call.lead_id,
        scheduled_time: nextCallAt,
      });
    }

    return new Response(JSON.stringify({ ok: true, disposition: parsed.disposition, next_call_at: nextCallAt }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
