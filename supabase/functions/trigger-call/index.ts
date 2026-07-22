// supabase/functions/trigger-call/index.ts
//
// Assembles context_data (lead info + prior call summary) and fires
// the Getello /calls endpoint. Call this from:
//   - the website contact-us form handler (first call), or
//   - dispatch-callbacks (automatic re-dial), or
//   - manually from the dashboard ("call now" button)
//
// Deploy: supabase functions deploy trigger-call
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//                 plus the Getello key stored via Supabase Vault (see below).

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { customer_id, business_id, lead_id } = await req.json();

    // 1. Business + Getello agent config
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", business_id)
      .single();
    if (bizErr || !business) throw new Error("Business not found");

    // 2. Pull the Getello API key from Supabase Vault — never hardcoded.
    //    Store it once via: select vault.create_secret('ak_live_...', 'getello_key_<business>');
    const { data: secretRow, error: secretErr } = await supabase
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", business.getello_api_key_secret_name)
      .single();
    if (secretErr || !secretRow) throw new Error("Getello key not found in Vault");
    const getelloApiKey = secretRow.decrypted_secret;

    // 3. Customer, lead, and last call summary
    const { data: customer } = await supabase
      .from("customers").select("*").eq("id", customer_id).single();
    if (!customer) throw new Error("Customer not found");

    // Compliance (§12): never dial a customer who has opted out. Refuse before
    // contacting Getello or logging a call.
    if (customer.opt_out) {
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: "customer_opted_out" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: lead } = lead_id
      ? await supabase.from("leads").select("*, project_types(*)").eq("id", lead_id).single()
      : { data: null };

    const { data: lastCall } = await supabase
      .from("calls")
      .select("id")
      .eq("customer_id", customer_id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let lastSummary = null;
    if (lastCall) {
      const { data } = await supabase
        .from("call_summaries")
        .select("*")
        .eq("call_id", lastCall.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastSummary = data;
    }

    // 4. Assemble context_data — this is what makes the agent "remember"
    const context_data: Record<string, unknown> = {
      user_name: customer.name,
      phonenumber: customer.phone_number,
      email: customer.email,
      scheduledDateTime: lead?.scheduled_datetime ?? null,
      business_name: business.name,
      preferred_language: lead?.language_preference ?? customer.preferred_language ?? "en",
    };

    if (lead?.project_types) {
      context_data.project_type = lead.project_types.name;
      context_data.default_description =
        lead.custom_description ?? lead.project_types.default_description;
      context_data.special_attractions =
        lead.selected_attractions ?? lead.project_types.special_attractions;
    }

    if (lastSummary) {
      context_data.previous_call_summary = lastSummary.summary_text;
      context_data.previous_disposition = lastSummary.disposition;
      context_data.previous_structured_data = lastSummary.structured_data;
      context_data.is_repeat_call = true;
    } else {
      context_data.is_repeat_call = false;
    }

    // TODO(compliance, §12): DND / DLT registration check.
    // Before production outbound dialing, verify the business's DND scrubbing
    // and DLT/PE telemarketer registration category. Deliberately NOT
    // implemented yet — this needs a business decision first.
    // See AI_BUILD_GUIDE.md §12 (DND / DLT registration).

    // 5. Call Getello
    const resp = await fetch(
      `https://api-in.getello.ai/api/agents/${business.getello_agent_id}/calls`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": getelloApiKey,
        },
        body: JSON.stringify({
          to_number: customer.phone_number,
          agent_type: "telephonic",
          context_data,
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Getello call failed: ${resp.status} ${errText}`);
    }
    const getelloResult = await resp.json();

    // 6. Log the call
    const { data: call, error: callErr } = await supabase
      .from("calls")
      .insert({
        business_id,
        customer_id,
        lead_id,
        getello_call_id: getelloResult.call_id ?? null,
        context_data_sent: context_data,
        call_status: "initiated",
      })
      .select()
      .single();
    if (callErr) throw callErr;

    return new Response(JSON.stringify({ ok: true, call_id: call.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
