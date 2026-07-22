"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type OnboardingState = { ok: boolean; message: string | null };

export async function createBusiness(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const vertical = String(formData.get("vertical") ?? "real_estate").trim();
  const getelloAgentId = String(formData.get("getello_agent_id") ?? "").trim();
  const getelloApiKey = String(formData.get("getello_api_key") ?? "").trim();
  const defaultCallbackHours = Number(formData.get("default_callback_hours") ?? 24);
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();

  if (!name || !getelloAgentId || !getelloApiKey) {
    return { ok: false, message: "Name, Getello agent ID, and Getello API key are required." };
  }

  const svc = createServiceClient();

  // 1. Store the Getello key in Vault under a generated, unguessable name.
  //    The raw key is NEVER written to a regular column or returned to the client.
  const secretName = `getello_api_key_${randomUUID()}`;
  const { error: vaultErr } = await svc.rpc("admin_create_getello_secret", {
    p_secret: getelloApiKey,
    p_name: secretName,
  });
  if (vaultErr) {
    return { ok: false, message: `Failed to store key in Vault: ${vaultErr.message}` };
  }

  // 2. Create the business row, referencing the secret by NAME only.
  const { error: bizErr } = await svc.from("businesses").insert({
    name,
    vertical,
    getello_agent_id: getelloAgentId,
    getello_api_key_secret_name: secretName,
    default_callback_hours: Number.isFinite(defaultCallbackHours) ? defaultCallbackHours : 24,
    owner_user_id: ownerUserId || null,
  });
  if (bizErr) {
    return { ok: false, message: `Business created key in Vault, but row insert failed: ${bizErr.message}` };
  }

  revalidatePath("/onboarding");
  revalidatePath("/overview");
  // Note: we deliberately return NO key material — it exists only in Vault now.
  return { ok: true, message: `Business "${name}" onboarded. Getello key stored securely in Vault.` };
}
