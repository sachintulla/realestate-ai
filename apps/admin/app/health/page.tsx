import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

function Metric({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "normal" | "warn" | "muted";
}) {
  const valueCls =
    tone === "warn" ? "text-amber-400" : tone === "muted" ? "text-gray-500" : "text-gray-100";
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className={`text-2xl font-bold ${valueCls}`}>{value}</div>
      <div className="mt-1 text-sm">{label}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export default async function HealthPage() {
  await requireAdmin();
  const svc = createServiceClient();

  const [failedCalls, pendingCallbacks, triggeredCallbacks] = await Promise.all([
    countRows(svc, "calls", { call_status: "failed" }),
    countRows(svc, "scheduled_callbacks", { status: "pending" }),
    countRows(svc, "scheduled_callbacks", { status: "triggered" }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">System health</h1>
        <p className="mt-1 text-sm text-gray-400">Failed calls and the callback queue at a glance.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric
          label="Failed Getello calls"
          value={failedCalls}
          tone={failedCalls > 0 ? "warn" : "normal"}
          hint="calls.call_status = 'failed'"
        />
        <Metric
          label="Callback queue depth"
          value={pendingCallbacks}
          hint="scheduled_callbacks pending"
        />
        <Metric
          label="In-flight callbacks"
          value={triggeredCallbacks}
          hint="scheduled_callbacks triggered (not yet completed)"
        />
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <Metric
          label="Edge Function error rate"
          value="N/A"
          tone="muted"
          hint="Not instrumented in MVP — needs structured logging with a shared correlation ID across the four functions (see AI_BUILD_GUIDE.md §16, Observability)."
        />
      </div>
    </div>
  );
}
