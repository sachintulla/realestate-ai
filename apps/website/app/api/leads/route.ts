// apps/website/app/api/leads/route.ts
//
// Public-facing intake endpoint for the Contact-Us form. Never let the
// browser insert into `leads`/`customers` directly — always go through
// this server route so validation, consent, and rate-limiting apply.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only route — never expose this key to the client
);

// Swap this Map for Redis/Upstash before production — it only works
// within a single server instance and resets on redeploy.
const RATE_LIMIT_WINDOW_MS = 60_000;
const recentSubmissions = new Map<string, number>();

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    business_id, user_name, phone_number, email,
    project_type_id, scheduled_datetime, message,
    consent, language_preference,
  } = body;

  if (!consent) {
    return NextResponse.json({ ok: false, error: "Consent is required" }, { status: 400 });
  }
  if (!business_id || !user_name || !phone_number) {
    return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 });
  }
  if (!/^\+?[0-9]{10,13}$/.test(phone_number.replace(/\s/g, ""))) {
    return NextResponse.json({ ok: false, error: "Invalid phone number" }, { status: 400 });
  }

  const lastSubmit = recentSubmissions.get(phone_number);
  if (lastSubmit && Date.now() - lastSubmit < RATE_LIMIT_WINDOW_MS) {
    return NextResponse.json({ ok: false, error: "Please wait before submitting again" }, { status: 429 });
  }
  recentSubmissions.set(phone_number, Date.now());

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .upsert(
      { business_id, phone_number, name: user_name, email, preferred_language: language_preference ?? "en" },
      { onConflict: "business_id,phone_number" }
    )
    .select()
    .single();
  if (custErr) return NextResponse.json({ ok: false, error: custErr.message }, { status: 500 });

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .insert({
      business_id, user_name, phone_number, email,
      project_type_id, scheduled_datetime, language_preference,
      custom_description: message ?? null,
      status: "new",
    })
    .select()
    .single();
  if (leadErr) return NextResponse.json({ ok: false, error: leadErr.message }, { status: 500 });

  // Kick off the first call immediately. If you'd rather batch first calls
  // (e.g. only during business hours), skip this and let a scheduled job
  // pick up new leads instead.
  await fetch(`${process.env.SUPABASE_URL}/functions/v1/trigger-call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ customer_id: customer.id, business_id, lead_id: lead.id }),
  });

  return NextResponse.json({ ok: true, lead_id: lead.id });
}
