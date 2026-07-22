"use client";

import { useActionState, useRef } from "react";
import { createBusiness, type OnboardingState } from "./actions";

const initial: OnboardingState = { ok: false, message: null };

const field =
  "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-base text-gray-100 focus:border-blue-500 focus:outline-none";
const label = "mb-1 block text-sm text-gray-300";

export default function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createBusiness, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // On success, clear the form so the (write-only) key field is never left populated.
  if (state.ok && formRef.current) formRef.current.reset();

  return (
    <form ref={formRef} action={formAction} className="max-w-lg space-y-4">
      <div>
        <label htmlFor="name" className={label}>Business name *</label>
        <input id="name" name="name" required className={field} />
      </div>

      <div>
        <label htmlFor="vertical" className={label}>Vertical</label>
        <input id="vertical" name="vertical" defaultValue="real_estate" className={field} />
      </div>

      <div>
        <label htmlFor="getello_agent_id" className={label}>Getello agent ID *</label>
        <input id="getello_agent_id" name="getello_agent_id" required className={field} />
      </div>

      <div>
        <label htmlFor="getello_api_key" className={label}>Getello API key *</label>
        <input
          id="getello_api_key"
          name="getello_api_key"
          type="password"
          required
          autoComplete="off"
          className={field}
        />
        <p className="mt-1 text-xs text-gray-500">
          Written to Supabase Vault on save and never shown again. It is not
          stored in any table column.
        </p>
      </div>

      <div>
        <label htmlFor="default_callback_hours" className={label}>Default callback hours</label>
        <input
          id="default_callback_hours"
          name="default_callback_hours"
          type="number"
          min={1}
          defaultValue={24}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="owner_user_id" className={label}>Owner user ID (optional)</label>
        <input id="owner_user_id" name="owner_user_id" placeholder="auth.users UUID" className={field} />
      </div>

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
        className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Onboarding…" : "Onboard business"}
      </button>
    </form>
  );
}
