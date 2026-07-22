"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, type Role } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

const ASSIGNABLE: ReadonlyArray<Exclude<Role, null>> = ["admin", "staff", "owner"];

export async function setUserRole(formData: FormData): Promise<void> {
  // Only an admin may change roles. (staff can view but the guard below is
  // intentionally strict — tighten to role === "admin" for privilege changes.)
  const { role: actorRole } = await requireAdmin();
  if (actorRole !== "admin") {
    throw new Error("Only an admin can change roles.");
  }

  const userId = String(formData.get("user_id") ?? "");
  const nextRole = String(formData.get("role") ?? "");
  if (!userId) throw new Error("Missing user_id");

  const svc = createServiceClient();

  // Empty selection clears the role claim entirely.
  const role = ASSIGNABLE.includes(nextRole as Exclude<Role, null>)
    ? (nextRole as Exclude<Role, null>)
    : null;

  const { error } = await svc.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/roles");
}
