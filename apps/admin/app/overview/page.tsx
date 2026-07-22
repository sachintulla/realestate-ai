import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CALL_STATUSES = ["initiated", "completed", "no_answer", "voicemail", "failed"] as const;
const DISPOSITIONS = ["interested", "callback_requested", "not_interested", "converted", "lost"] as const;

async function countRows(
  svc: SupabaseClient,
  table: string,
  filters: Record<string, string> = {},
): Promise<number> {
  let q = svc.from(table).select("*", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
  const { count } = await q;
  return count ?? 0;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-gray-400">{label}</div>
    </div>
  );
}

export default async function OverviewPage() {
  await requireAdmin();
  const svc = createServiceClient();

  const [businesses, totalLeads, convertedLeads, totalCalls] = await Promise.all([
    countRows(svc, "businesses"),
    countRows(svc, "leads"),
    countRows(svc, "leads", { status: "converted" }),
    countRows(svc, "calls"),
  ]);

  const callsByStatus = Object.fromEntries(
    await Promise.all(
      CALL_STATUSES.map(async (s) => [s, await countRows(svc, "calls", { call_status: s })] as const),
    ),
  );

  const byDisposition = Object.fromEntries(
    await Promise.all(
      DISPOSITIONS.map(async (d) => [d, await countRows(svc, "call_summaries", { disposition: d })] as const),
    ),
  );

  const conversionRate = totalLeads ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Cross-tenant overview</h1>
        <p className="mt-1 text-sm text-gray-400">Call volume, conversion, and pipeline health across every business.</p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Businesses" value={businesses} />
        <Stat label="Total leads" value={totalLeads} />
        <Stat label="Total calls" value={totalCalls} />
        <Stat label="Conversion rate" value={`${conversionRate}%`} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Calls by status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CALL_STATUSES.map((s) => (
            <Stat key={s} label={s.replace("_", " ")} value={callsByStatus[s]} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">Pipeline health (dispositions)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {DISPOSITIONS.map((d) => (
            <Stat key={d} label={d.replace("_", " ")} value={byDisposition[d]} />
          ))}
        </div>
      </section>
    </div>
  );
}
