import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import PromptEditor from "./PromptEditor";
import { rollbackPrompt } from "./actions";

export const dynamic = "force-dynamic";

type AgentPrompt = {
  id: string;
  prompt_text: string;
  prompt_type: string | null;
  pushed_at: string;
  is_active: boolean;
};

export default async function PromptsPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  await requireAdmin();
  const { business: selectedId } = await searchParams;
  const svc = createServiceClient();

  const { data: businesses } = await svc
    .from("businesses")
    .select("id, name")
    .order("name");
  const businessList = (businesses ?? []) as { id: string; name: string }[];

  let history: AgentPrompt[] = [];
  let activeText = "";
  if (selectedId) {
    const { data } = await svc
      .from("agent_prompts")
      .select("id, prompt_text, prompt_type, pushed_at, is_active")
      .eq("business_id", selectedId)
      .order("pushed_at", { ascending: false });
    history = (data ?? []) as AgentPrompt[];
    activeText = history.find((h) => h.is_active)?.prompt_text ?? "";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Prompt editor</h1>
        <p className="mt-1 text-sm text-gray-400">
          Edit and push a business&apos;s system prompt, view version history, and roll back.
        </p>
      </header>

      {/* Business picker */}
      <div className="flex flex-wrap gap-2">
        {businessList.map((b) => (
          <Link
            key={b.id}
            href={`/prompts?business=${b.id}`}
            className={`rounded-full px-3 py-1 text-sm ${
              b.id === selectedId
                ? "bg-blue-600 text-white"
                : "border border-gray-700 text-gray-300 hover:bg-gray-800"
            }`}
          >
            {b.name}
          </Link>
        ))}
        {businessList.length === 0 && (
          <p className="text-sm text-gray-500">No businesses yet — onboard one first.</p>
        )}
      </div>

      {selectedId && (
        <div className="grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Active prompt
            </h2>
            <PromptEditor businessId={selectedId} initialText={activeText} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Version history
            </h2>
            <ul className="space-y-3">
              {history.map((v) => (
                <li key={v.id} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400">
                      {new Date(v.pushed_at).toLocaleString()}
                      {v.is_active && (
                        <span className="ml-2 rounded-full bg-green-900 px-2 py-0.5 text-green-300">
                          active
                        </span>
                      )}
                    </span>
                    {!v.is_active && (
                      <form action={rollbackPrompt}>
                        <input type="hidden" name="business_id" value={selectedId} />
                        <input type="hidden" name="version_id" value={v.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800"
                        >
                          Roll back to this
                        </button>
                      </form>
                    )}
                  </div>
                  <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap text-xs text-gray-500">
                    {v.prompt_text.slice(0, 240)}
                    {v.prompt_text.length > 240 ? "…" : ""}
                  </pre>
                </li>
              ))}
              {history.length === 0 && (
                <li className="text-sm text-gray-500">No prompt versions pushed yet.</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
