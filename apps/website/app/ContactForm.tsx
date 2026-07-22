"use client";

import { useMemo, useState } from "react";

export type ProjectType = {
  id: string;
  name: string;
  default_description: string | null;
  special_attractions: string[] | null;
};

// Preferred call language options (§9): English / Telugu / Hindi / Tamil / Marathi
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "te", label: "Telugu" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "mr", label: "Marathi" },
];

// Mirror of the server's phone check in app/api/leads/route.ts — the server
// route remains the source of truth; this is only for fast user feedback.
const PHONE_RE = /^\+?[0-9]{10,13}$/;
function isValidPhone(raw: string): boolean {
  return PHONE_RE.test(raw.replace(/\s/g, ""));
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; leadId: string }
  | { kind: "error"; message: string };

export default function ContactForm({
  projectTypes,
  businessId,
}: {
  projectTypes: ProjectType[];
  businessId: string;
}) {
  const [userName, setUserName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [projectTypeId, setProjectTypeId] = useState("");
  const [scheduledDatetime, setScheduledDatetime] = useState("");
  const [language, setLanguage] = useState("en");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });

  const selectedType = useMemo(
    () => projectTypes.find((p) => p.id === projectTypeId) ?? null,
    [projectTypes, projectTypeId],
  );

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!userName.trim()) e.userName = "Please enter your name.";
    if (!phone.trim()) e.phone = "Please enter your phone number.";
    else if (!isValidPhone(phone))
      e.phone = "Enter a valid phone number (10–13 digits, optional +).";
    if (!consent) e.consent = "Consent is required to receive a call.";
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmit({ kind: "submitting" });
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          user_name: userName,
          phone_number: phone,
          email: email || null,
          project_type_id: projectTypeId || null,
          scheduled_datetime: scheduledDatetime
            ? new Date(scheduledDatetime).toISOString()
            : null,
          message: message || null,
          consent,
          language_preference: language,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSubmit({
          kind: "error",
          message: data?.error ?? `Submission failed (${res.status}).`,
        });
        return;
      }
      setSubmit({ kind: "success", leadId: data.lead_id });
    } catch {
      setSubmit({
        kind: "error",
        message: "Network error — please try again.",
      });
    }
  }

  if (submit.kind === "success") {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-xl font-semibold text-green-800">Thank you!</h2>
        <p className="mt-2 text-green-700">
          We&apos;ve received your enquiry and will call you shortly.
        </p>
        <p className="mt-1 text-xs text-green-600">Reference: {submit.leadId}</p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base " +
    "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";
  const labelCls = "mb-1 block text-sm font-medium text-gray-700";
  const errCls = "mt-1 text-sm text-red-600";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor="name" className={labelCls}>
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className={inputCls}
          autoComplete="name"
          aria-invalid={!!errors.userName}
        />
        {errors.userName && <p className={errCls}>{errors.userName}</p>}
      </div>

      <div>
        <label htmlFor="phone" className={labelCls}>
          Phone <span className="text-red-500">*</span>
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputCls}
          placeholder="+91 98765 43210"
          autoComplete="tel"
          aria-invalid={!!errors.phone}
        />
        {errors.phone && <p className={errCls}>{errors.phone}</p>}
      </div>

      <div>
        <label htmlFor="email" className={labelCls}>
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="projectType" className={labelCls}>
          Project type
        </label>
        <select
          id="projectType"
          value={projectTypeId}
          onChange={(e) => setProjectTypeId(e.target.value)}
          className={inputCls}
        >
          <option value="">Select a project type…</option>
          {projectTypes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Read-only auto-filled details once a project type is selected (§9) */}
      {selectedType && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          {selectedType.default_description && (
            <p className="text-sm leading-relaxed text-gray-700">
              {selectedType.default_description}
            </p>
          )}
          {selectedType.special_attractions &&
            selectedType.special_attractions.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {selectedType.special_attractions.map((a, i) => (
                  <li
                    key={i}
                    className="rounded-full bg-white px-3 py-1 text-xs text-gray-600 ring-1 ring-gray-200"
                  >
                    ✓ {a}
                  </li>
                ))}
              </ul>
            )}
          <p className="mt-3 text-xs italic text-gray-400">
            These details are provided for reference and cannot be edited here.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="callback" className={labelCls}>
          Preferred callback date &amp; time
        </label>
        <input
          id="callback"
          type="datetime-local"
          value={scheduledDatetime}
          onChange={(e) => setScheduledDatetime(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="language" className={labelCls}>
          Preferred call language
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={inputCls}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className={labelCls}>
          Message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className={inputCls}
          placeholder="Tell us what you're looking for…"
        />
      </div>

      <div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-5 w-5 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            aria-invalid={!!errors.consent}
          />
          <span className="text-sm text-gray-700">
            I authorise you to contact me by phone about my enquiry.{" "}
            <span className="text-red-500">*</span>
          </span>
        </label>
        {errors.consent && <p className={errCls}>{errors.consent}</p>}
      </div>

      {submit.kind === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submit.message}
        </div>
      )}

      <button
        type="submit"
        disabled={submit.kind === "submitting"}
        className="mt-2 w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submit.kind === "submitting" ? "Submitting…" : "Request a call"}
      </button>

      <p className="text-center text-xs text-gray-400">
        By submitting, you consent to being contacted about your enquiry.
      </p>
    </form>
  );
}
