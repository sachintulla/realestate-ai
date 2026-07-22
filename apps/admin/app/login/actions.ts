"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAdminRole, roleOf } from "@/lib/auth";

export type LoginState = { error: string | null };

// Sign-in runs on the server so the publishable key / auth flow never has to
// be exposed to the browser. On success the SSR client sets the session
// cookies; we then verify the role before letting the user in.
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Invalid credentials." };
  }

  if (!isAdminRole(roleOf(data.user.app_metadata))) {
    // Valid account, but not an admin/staff role — don't grant access.
    await supabase.auth.signOut();
    return { error: "This account does not have admin access." };
  }

  redirect("/overview");
}
