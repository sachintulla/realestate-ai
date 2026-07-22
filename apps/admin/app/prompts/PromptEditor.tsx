"use client";

import { useActionState } from "react";
import { pushPrompt, type PushState } from "./actions";

const initial: PushState = { ok: false, message: null };

export default function PromptEditor({
  businessId,
  initialText,
}: {
  businessId: string;
  initialText: string;
}) {
  const [state, formAction, pending] = useActionState(pushPrompt, initial);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="business_id" value={businessId} />
      <textarea
        name="prompt_text"
        defaultValue={initialText}
        rows={18}
        className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 font-mono text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        placeholder="System prompt text…"
      />
      {state.message && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            state.ok
              ? "border-green-800 bg-green-950 text-green-300"
              : "border-red-800 bg-red-950 text-red-300"
          }`}
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Pushing…" : "Push to Getello"}
      </button>
    </form>
  );
}
