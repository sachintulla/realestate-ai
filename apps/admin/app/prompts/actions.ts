"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type PushState = { ok: boolean; message: string | null };

// Calls the update-agent-prompt edge function (§6.4), which pushes to Getello
// AND records a new active row in agent_prompts (deactivating the prior one).
async function pushToGetello(
  businessId: string,
  promptText: string,
  pushedBy: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return { ok: false, error: "Missing SUPABASE_URL / service role key" };

  const res = await fetch(`${base}/functions/v1/update-agent-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      business_id: businessId,
      prompt_text: promptText,
      prompt_type: "hybrid",
      pushed_by: pushedBy,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function pushPrompt(_prev: PushState, formData: FormData): Promise<PushState> {
  const { user } = await requireAdmin();
  const businessId = String(formData.get("business_id") ?? "");
  const promptText = String(formData.get("prompt_text") ?? "").trim();

  if (!businessId || !promptText) {
    return { ok: false, message: "Select a business and enter prompt text." };
  }

  const result = await pushToGetello(businessId, promptText, user?.id ?? null);
  if (!result.ok) return { ok: false, message: `Push failed: ${result.error}` };

  revalidatePath("/prompts");
  return { ok: true, message: "Prompt pushed and recorded as the active version." };
}

// Rollback = push a previous version's text back through the same path, so it
// becomes the new active version on Getello and in agent_prompts.
export async function rollbackPrompt(formData: FormData): Promise<void> {
  const { user } = await requireAdmin();
  const businessId = String(formData.get("business_id") ?? "");
  const versionId = String(formData.get("version_id") ?? "");
  if (!businessId || !versionId) throw new Error("Missing business_id or version_id");

  const svc = createServiceClient();
  const { data: version, error } = await svc
    .from("agent_prompts")
    .select("prompt_text")
    .eq("id", versionId)
    .single();
  if (error || !version) throw new Error("Version not found");

  const result = await pushToGetello(businessId, version.prompt_text, user?.id ?? null);
  if (!result.ok) throw new Error(`Rollback failed: ${result.error}`);

  revalidatePath("/prompts");
}
