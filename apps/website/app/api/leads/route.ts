// apps/website/app/api/leads/route.ts
//
// Public-facing Contact-Us intake endpoint.
//
// STUB — Phase 0 scaffold only. The full implementation (validation,
// mandatory consent, rate-limiting, customers upsert, leads insert, and
// kicking off trigger-call) is specified in docs/AI_BUILD_GUIDE.md §9 and
// lands in Phase 5. The browser must never write to the database directly —
// all intake goes through this server route.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Not implemented — see docs/AI_BUILD_GUIDE.md §9 (Phase 5)",
    },
    { status: 501 },
  );
}
