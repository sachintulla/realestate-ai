// supabase/functions/update-agent-prompt/index.ts
//
// Pushes a new system prompt to a business's Getello agent and records
// it in agent_prompts for version history / rollback. Call this from
// the Admin Dashboard's prompt-editor screen (or the Web Dashboard's
// Settings screen, if business owners are allowed to edit their own
// agent's prompt).
//
// NOTE: the Getello endpoint is PUT /api/agents/{agent_id} — a plain
// server-to-server PUT. The "Access-Control-Request-Method: PUT" header
// sometimes seen in captured requests is a browser CORS-preflight
// artifact; it is not sent here because this call never runs in a browser.
//
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { business_id, prompt_text, prompt_type = "hybrid", pushed_by } = await req.json();
    if (!business_id || !prompt_text) {
      throw new Error("business_id and prompt_text are required");
    }

    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", business_id)
      .single();
    if (bizErr || !business) throw new Error("Business not found");

    // Getello key from Vault — never hardcoded, never client-supplied
    const { data: secretRow, error: secretErr } = await supabase
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", business.getello_api_key_secret_name)
      .single();
    if (secretErr || !secretRow) throw new Error("Getello key not found in Vault");
    const getelloApiKey = secretRow.decrypted_secret;

    const resp = await fetch(
      `https://api-in.getello.ai/api/agents/${business.getello_agent_id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": getelloApiKey,
        },
        body: JSON.stringify({ type: prompt_type, prompt: prompt_text }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Getello prompt update failed: ${resp.status} ${errText}`);
    }

    // Deactivate the previous version, then record this one as active.
    // (Kept as two statements for clarity; wrap in a transaction/RPC in production.)
    await supabase.from("agent_prompts")
      .update({ is_active: false })
      .eq("business_id", business_id)
      .eq("is_active", true);

    const { data: version, error: insertErr } = await supabase
      .from("agent_prompts")
      .insert({
        business_id,
        prompt_text,
        prompt_type,
        pushed_by: pushed_by ?? null,
        is_active: true,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true, version_id: version.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
