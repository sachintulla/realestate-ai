// Role helpers. Access to the admin app requires a role claim of 'admin' or
// 'staff' — NOT merely a valid session. The role lives in the user's
// app_metadata.role custom claim (set from the Role Management screen via the
// Supabase Admin API).

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export type Role = "admin" | "staff" | "owner" | null;

export const ADMIN_ROLES: ReadonlyArray<Role> = ["admin", "staff"];

export function roleOf(appMetadata: unknown): Role {
  const role = (appMetadata as { role?: string } | null)?.role;
  if (role === "admin" || role === "staff" || role === "owner") return role;
  return null;
}

export function isAdminRole(role: Role): boolean {
  return role === "admin" || role === "staff";
}

export async function getUserAndRole() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = user ? roleOf(user.app_metadata) : null;
  return { user, role };
}

// Guard for admin Server Components and server actions (defense-in-depth on
// top of middleware). Redirects unauthenticated -> /login, non-admin -> /forbidden.
export async function requireAdmin() {
  const { user, role } = await getUserAndRole();
  if (!user) redirect("/login");
  if (!isAdminRole(role)) redirect("/forbidden");
  return { user, role };
}
