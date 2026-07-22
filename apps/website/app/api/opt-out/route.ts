// apps/website/app/api/opt-out/route.ts
//
// Compliance (§12) — the customer "don't call again" path. Setting opt_out:
//   1. blocks future trigger-call calls (trigger-call refuses opted-out
//      customers), and
//   2. immediately cancels all their pending scheduled_callbacks.
//
// Server-only route: uses the service-role key, never exposed to the client.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // server-only — never expose to the client
);

export async function POST(req: NextRequest) {
  const { business_id, phone_number } = await req.json();

  if (!business_id || !phone_number) {
    return NextResponse.json(
      { ok: false, error: "business_id and phone_number are required" },
      { status: 400 },
    );
  }

  // 1. Flag the customer as opted out (blocks future trigger-call).
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .update({ opt_out: true })
    .eq("business_id", business_id)
    .eq("phone_number", phone_number)
    .select("id")
    .maybeSingle();
  if (custErr) {
    return NextResponse.json({ ok: false, error: custErr.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ ok: false, error: "Customer not found" }, { status: 404 });
  }

  // 2. Immediately cancel every pending callback for this customer.
  const { error: cbErr } = await supabase
    .from("scheduled_callbacks")
    .update({ status: "cancelled" })
    .eq("customer_id", customer.id)
    .eq("status", "pending");
  if (cbErr) {
    return NextResponse.json({ ok: false, error: cbErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
