# Ello AI Real Estate Voice Agent Ecosystem — AI Build Guide

**Purpose of this document:** this is a self-contained build brief meant to be
handed to an AI coding agent (Claude Code, Cursor, etc.) to scaffold this
system end-to-end. Every schema, function, and prompt below is the final,
already-designed version — build to it exactly rather than re-deriving it.
Where a decision is still open, it is called out explicitly as **OPEN
QUESTION** rather than left ambiguous.

Version: 1.0 · Source program: Getello / LeadPulse — Real Estate Vertical

---

## 0. How To Use This Document

1. Work through the numbered phases in order — each has a **Definition of
   Done** checklist. Do not mark a phase complete until every item passes.
2. Do not invent new table names, environment variable names, endpoints, or
   file paths beyond what is specified here. If something is genuinely
   ambiguous, stop and ask rather than guessing.
3. Every secret (API keys, service-role keys) must be read from environment
   variables or Supabase Vault — never hardcoded, never logged, never
   returned in an API response.
4. This document supersedes any conflicting assumption made mid-build —
   re-read the relevant section before improvising.

---

## 1. System Summary

A real-estate business publishes a Contact-Us form. Every submission becomes
a lead that an AI voice agent (built on the Getello telephonic API) calls
automatically. The agent's system prompt is grounded in structured memory of
every prior call with that customer, so a second call picks up exactly where
the first left off instead of re-pitching from scratch. After each call, an
LLM extraction step turns the transcript into a structured disposition and,
if the customer asked for a callback, the system re-dials automatically at
the promised time — no human re-dials manually. Business owners and
xCubeLabs operations staff each get a dashboard scoped to what they need.

---

## 2. Tech Stack (fixed — do not substitute without a stated reason)

| Layer | Choice |
|---|---|
| Public website | Next.js (App Router) + TypeScript + Tailwind CSS |
| Business dashboard | Next.js + TypeScript + Tailwind + Supabase JS client + Recharts |
| Admin dashboard | Next.js (separate app), same stack, role-gated |
| Backend / database | Supabase — Postgres, Auth, Vault, Edge Functions (Deno) |
| Scheduler | pg_cron + pg_net (Supabase Postgres extensions) |
| Voice agent | Getello telephonic API (external, already provisioned) |
| Transcript extraction | Anthropic Claude API (`claude-sonnet-5`) |
| Hosting | Vercel (the three Next.js apps) + Supabase (backend) |

---

## 3. Repository Structure

```
/
├── apps/
│   ├── website/                  # public site + Contact-Us form
│   │   └── app/api/leads/route.ts
│   ├── dashboard/                 # business-owner dashboard
│   └── admin/                     # super-admin / ops dashboard
├── supabase/
│   ├── migrations/
│   │   └── 0001_init.sql          # = schema.sql, §5 below
│   ├── functions/
│   │   ├── trigger-call/index.ts
│   │   ├── process-call-summary/index.ts
│   │   ├── dispatch-callbacks/index.ts
│   │   └── update-agent-prompt/index.ts
│   └── cron.sql
├── docs/
│   └── AI_BUILD_GUIDE.md          # this file
└── README.md
```

---

## 4. Environment Variables

| Variable | Used By | Notes |
|---|---|---|
| `SUPABASE_URL` | all apps + functions | safe for client-side use |
| `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | website, dashboards | safe for client-side use |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions, server-only API routes | **never** in client code, never logged |
| `ANTHROPIC_API_KEY` | `process-call-summary` | server/function secret only |
| Getello API key (per business) | Edge Functions, via Vault | stored as a named secret in Supabase Vault, referenced by `businesses.getello_api_key_secret_name` — never an env var, never a DB column |
| `GETELLO_AGENT_ID` (per business) | stored on `businesses.getello_agent_id`, not an env var | |

---

## 5. Database Schema

Run this as the first migration (`supabase/migrations/0001_init.sql`).
It is complete: all tables, indexes, starter RLS policies, and the 12 seeded
real-estate project types.

```sql
-- =========================================================
-- Ello AI Voice Agent Ecosystem — Supabase Schema
-- =========================================================
-- Run this in the Supabase SQL Editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. BUSINESSES — one row per tenant/client/vertical account
--    (LeadPulse is multi-tenant, so this is the top-level scope)
-- ---------------------------------------------------------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text not null,                 -- 'real_estate', 'insurance', 'chit_fund', ...
  getello_agent_id text not null,         -- e.g. 6a323481d382b88fe369920f
  getello_api_key_secret_name text not null, -- name of the secret in Supabase Vault — never the raw key
  default_callback_hours int default 24,  -- fallback when the caller is vague ("call me later")
  owner_user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 2. PROJECT TYPES — reusable, owner-editable defaults per vertical
--    (this is the "auto-filled, business owner can edit" content
--     from your Real Estate example: Default Description +
--     Special Attractions checkboxes)
-- ---------------------------------------------------------
create table project_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade, -- null = global template
  name text not null,
  default_description text,
  special_attractions jsonb default '[]'::jsonb, -- ["Approved layout", "Wide roads", ...]
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 3. LEADS — captured from the website "Contact Us" intake form
-- ---------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  user_name text not null,
  phone_number text not null,
  email text,
  scheduled_datetime timestamptz,         -- requested callback slot from the form
  project_type_id uuid references project_types(id),
  custom_description text,                -- owner override for this specific lead
  selected_attractions jsonb,             -- subset of checkboxes the owner kept/edited
  language_preference text,               -- 'en' | 'te' | 'hi' | 'ta' | 'mr' ... captured on the form
  source text default 'website_form',
  status text default 'new',              -- new | queued | called | converted | lost
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 4. CUSTOMERS — canonical identity, deduped by phone number
-- ---------------------------------------------------------
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  phone_number text not null,
  name text,
  email text,
  preferred_language text default 'en', -- 'en' | 'te' | 'hi' | 'ta' | 'mr' ...
  created_at timestamptz default now(),
  unique (business_id, phone_number)
);

-- ---------------------------------------------------------
-- 5. CALLS — every actual voice call placed through Getello
-- ---------------------------------------------------------
create table calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  lead_id uuid references leads(id),
  getello_call_id text,                   -- id Getello returns, if any
  context_data_sent jsonb,                -- exact payload sent, kept for audit/debugging
  call_status text default 'initiated',   -- initiated | completed | no_answer | voicemail | failed
  started_at timestamptz default now(),
  ended_at timestamptz,
  raw_transcript text
);

-- ---------------------------------------------------------
-- 6. CALL SUMMARIES — structured extraction after each call
-- ---------------------------------------------------------
create table call_summaries (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete cascade,
  summary_text text,
  structured_data jsonb,      -- {interest_level, budget_window, project_size, objections, sentiment}
  disposition text,           -- interested | callback_requested | not_interested | converted | lost
  next_action text,
  next_call_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 7. SCHEDULED CALLBACKS — drives the automatic re-dial
-- ---------------------------------------------------------
create table scheduled_callbacks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  lead_id uuid references leads(id),
  scheduled_time timestamptz not null,
  status text default 'pending',  -- pending | triggered | completed | cancelled
  attempt_count int default 0,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- 8. AGENT PROMPTS — version history for the live Getello system prompt
-- ---------------------------------------------------------
create table agent_prompts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade,
  prompt_text text not null,
  prompt_type text default 'hybrid',   -- Getello's agent "type" field
  pushed_at timestamptz default now(),
  pushed_by uuid references auth.users(id),
  is_active boolean default true       -- true = currently live on the Getello agent
);

create index idx_agent_prompts_business on agent_prompts(business_id, pushed_at desc);

alter table agent_prompts enable row level security;
create policy "owner can manage own prompt history"
  on agent_prompts for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------
create index idx_calls_customer on calls(customer_id);
create index idx_summaries_call on call_summaries(call_id);
create index idx_callbacks_pending on scheduled_callbacks(status, scheduled_time);
create index idx_customers_phone on customers(business_id, phone_number);
create index idx_leads_business on leads(business_id, status);

-- ---------------------------------------------------------
-- Row Level Security (starter policy — extend before production)
-- Scopes every business-owned table to its owner_user_id via businesses.
-- ---------------------------------------------------------
alter table businesses enable row level security;
alter table leads enable row level security;
alter table customers enable row level security;
alter table calls enable row level security;
alter table call_summaries enable row level security;
alter table scheduled_callbacks enable row level security;

create policy "owner can manage own business"
  on businesses for all
  using (owner_user_id = auth.uid());

create policy "owner can see own leads"
  on leads for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "owner can see own customers"
  on customers for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "owner can see own calls"
  on calls for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

create policy "owner can see own summaries"
  on call_summaries for all
  using (call_id in (
    select id from calls where business_id in (
      select id from businesses where owner_user_id = auth.uid()
    )
  ));

create policy "owner can see own callbacks"
  on scheduled_callbacks for all
  using (business_id in (select id from businesses where owner_user_id = auth.uid()));

-- ---------------------------------------------------------
-- Seed: the 12 default project types from your Real Estate spec
-- (business_id left NULL = global template; clone per business on onboarding)
-- ---------------------------------------------------------
insert into project_types (name, default_description, special_attractions) values

('Residential Plots',
 'This project offers residential plots suitable for constructing independent houses or villas. Buyers can select plots based on preferred size, facing, location and budget. The project may include internal roads, electricity, drainage, water facilities, landscaping, security and community amenities.',
 '["Approved residential layout","Clear plot demarcation","Multiple plot sizes and facing options","Wide internal roads","Electricity and water facilities","Suitable for immediate construction","Gated-community features","Nearby schools, hospitals and markets","Good future development potential"]'),

('Agricultural / Farm Land',
 'This project offers agricultural or farm land suitable for cultivation, investment, farmhouse development, weekend use or long-term land ownership. The property may include road access, water availability, fencing, plantation and electricity, subject to applicable land-use regulations.',
 '["Fertile and usable land","Road access to the property","Borewell or water-source availability","Electricity connectivity","Fencing and clear boundaries","Existing plantation or crop potential","Suitable for farmhouse development","Peaceful natural surroundings","Long-term land appreciation potential"]'),

('Independent Houses / Villas',
 'This project offers independent houses or villas for families seeking privacy, dedicated land ownership and spacious living. The properties may include multiple bedrooms, parking, balconies, private open areas, modern interiors and community amenities.',
 '["Independent land ownership","Private parking","Spacious bedrooms and living areas","Modern elevation and interiors","Balcony, terrace or private garden","Gated-community environment","Children''s play area","Clubhouse or community facilities","Ready-to-move or customisation options"]'),

('Apartments / Flats',
 'This residential project offers apartments or flats in configurations such as 1 BHK, 2 BHK, 3 BHK or larger units. The project may include lifts, parking, security, power backup, common areas and recreational facilities.',
 '["Multiple apartment configurations","Vastu-friendly floor plans","Lift and power backup","Covered parking","CCTV and security","Clubhouse and indoor facilities","Gym, play area and walking track","Good ventilation and natural lighting","Convenient access to schools, offices and hospitals"]'),

('Commercial Shops / Showrooms',
 'This project offers commercial shops or showrooms suitable for retail stores, supermarkets, pharmacies, restaurants, branded outlets and service businesses. The spaces may provide good road visibility, customer access, parking and signage opportunities.',
 '["Main-road frontage","High visibility and branding potential","Strong customer footfall","Suitable for branded businesses","Flexible shop or showroom sizes","Parking availability","Easy loading and unloading access","Near residential and commercial areas","Suitable for retail, food and service businesses"]'),

('Office Spaces',
 'This project offers office spaces suitable for companies, startups, professionals, clinics, consultancies and service businesses. The property may include flexible floor plans, parking, lifts, security, power backup and internet connectivity provisions.',
 '["Professional business location","Flexible office layouts","Ready-to-use office infrastructure","Lift and parking facilities","Power backup","High-speed internet provisions","Reception and meeting-room options","Suitable for startups and established companies","Easy access for employees and clients"]'),

('Commercial Buildings',
 'This project offers an entire commercial building or multiple commercial floors suitable for offices, retail businesses, hospitals, educational institutions, financial organisations or corporate operations.',
 '["Complete building or floor-wise availability","Independent entrance and access","Prominent road-facing location","Large branding and signage area","Lift and staircase facilities","Dedicated parking","Flexible commercial usage","Suitable for banks, hospitals and institutions","Long-term rental-income potential"]'),

('Warehouses / Industrial Properties',
 'This project offers warehouses, industrial sheds or commercial land suitable for storage, logistics, manufacturing, distribution and business operations. The property may include wide-road access, loading areas, power availability and security.',
 '["Wide-road and heavy-vehicle access","Large storage or production area","Loading and unloading facilities","High roof clearance","Industrial power availability","Security and boundary fencing","Parking for trucks and commercial vehicles","Near highways or logistics routes","Suitable for manufacturing and distribution"]'),

('Mixed-Use Projects',
 'This project combines residential, commercial, office or retail spaces within a single integrated development. It is designed to offer homes, businesses, shopping and essential services in one convenient location.',
 '["Residential and commercial spaces together","Shops and essential services within the project","Better convenience for residents","Strong business and rental potential","Multiple investment opportunities","Planned parking and internal roads","Community amenities","High customer and resident footfall","Suitable for both investors and end users"]'),

('Rental / Lease Properties',
 'This property is available for residential or commercial rental or lease. It may be suitable for families, companies, retail brands, offices, institutions or other business users, depending on the property type and location.',
 '["Ready for immediate occupancy","Flexible rental or lease terms","Suitable for residential or business use","Prime or convenient location","Parking and access facilities","Good road visibility","Branding opportunities for commercial tenants","Long-term lease options","Property maintenance support"]'),

('Resale Properties',
 'This listing includes an existing property being offered for resale by its current owner or authorised representative. The property may be ready for immediate possession and can include land, houses, apartments, villas or commercial spaces.',
 '["Ready for immediate possession","Established neighbourhood","Existing utilities and infrastructure","No construction waiting period","Potential price advantage","Verified ownership documents","Loan eligibility, where applicable","Renovation or customisation potential","Nearby schools, hospitals and commercial facilities"]'),

('Other',
 'This category is for properties or real-estate projects that do not fall under the listed options. The owner can provide details about the property type, location, size, intended use, development status and selling or leasing requirements.',
 '["Unique property category","Custom development potential","Flexible usage options","Strategic location advantages","Investment or income-generation potential","Available infrastructure and facilities","Nearby landmarks and connectivity","Special approvals or permissions","Features unique to the property"]');

```

**Definition of Done — Phase: Schema**
- [ ] Migration runs cleanly against a fresh Supabase project
- [ ] All 8 tables exist with RLS enabled
- [ ] `project_types` has 12 seeded rows
- [ ] `pgcrypto` extension is enabled (needed for `gen_random_uuid()`)

---

## 6. Edge Functions

Deploy all four with `supabase functions deploy <name>`. Each is complete —
use as written.

### 6.1 `trigger-call` — places a call with full memory of prior calls

```typescript
// supabase/functions/trigger-call/index.ts
//
// Assembles context_data (lead info + prior call summary) and fires
// the Getello /calls endpoint. Call this from:
//   - the website contact-us form handler (first call), or
//   - dispatch-callbacks (automatic re-dial), or
//   - manually from the dashboard ("call now" button)
//
// Deploy: supabase functions deploy trigger-call
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//                 plus the Getello key stored via Supabase Vault (see below).

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { customer_id, business_id, lead_id } = await req.json();

    // 1. Business + Getello agent config
    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", business_id)
      .single();
    if (bizErr || !business) throw new Error("Business not found");

    // 2. Pull the Getello API key from Supabase Vault — never hardcoded.
    //    Store it once via: select vault.create_secret('ak_live_...', 'getello_key_<business>');
    const { data: secretRow, error: secretErr } = await supabase
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", business.getello_api_key_secret_name)
      .single();
    if (secretErr || !secretRow) throw new Error("Getello key not found in Vault");
    const getelloApiKey = secretRow.decrypted_secret;

    // 3. Customer, lead, and last call summary
    const { data: customer } = await supabase
      .from("customers").select("*").eq("id", customer_id).single();
    if (!customer) throw new Error("Customer not found");

    const { data: lead } = lead_id
      ? await supabase.from("leads").select("*, project_types(*)").eq("id", lead_id).single()
      : { data: null };

    const { data: lastCall } = await supabase
      .from("calls")
      .select("id")
      .eq("customer_id", customer_id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let lastSummary = null;
    if (lastCall) {
      const { data } = await supabase
        .from("call_summaries")
        .select("*")
        .eq("call_id", lastCall.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastSummary = data;
    }

    // 4. Assemble context_data — this is what makes the agent "remember"
    const context_data: Record<string, unknown> = {
      user_name: customer.name,
      phonenumber: customer.phone_number,
      email: customer.email,
      scheduledDateTime: lead?.scheduled_datetime ?? null,
      business_name: business.name,
      preferred_language: lead?.language_preference ?? customer.preferred_language ?? "en",
    };

    if (lead?.project_types) {
      context_data.project_type = lead.project_types.name;
      context_data.default_description =
        lead.custom_description ?? lead.project_types.default_description;
      context_data.special_attractions =
        lead.selected_attractions ?? lead.project_types.special_attractions;
    }

    if (lastSummary) {
      context_data.previous_call_summary = lastSummary.summary_text;
      context_data.previous_disposition = lastSummary.disposition;
      context_data.previous_structured_data = lastSummary.structured_data;
      context_data.is_repeat_call = true;
    } else {
      context_data.is_repeat_call = false;
    }

    // 5. Call Getello
    const resp = await fetch(
      `https://api-in.getello.ai/api/agents/${business.getello_agent_id}/calls`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": getelloApiKey,
        },
        body: JSON.stringify({
          to_number: customer.phone_number,
          agent_type: "telephonic",
          context_data,
        }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Getello call failed: ${resp.status} ${errText}`);
    }
    const getelloResult = await resp.json();

    // 6. Log the call
    const { data: call, error: callErr } = await supabase
      .from("calls")
      .insert({
        business_id,
        customer_id,
        lead_id,
        getello_call_id: getelloResult.call_id ?? null,
        context_data_sent: context_data,
        call_status: "initiated",
      })
      .select()
      .single();
    if (callErr) throw callErr;

    return new Response(JSON.stringify({ ok: true, call_id: call.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

```

### 6.2 `process-call-summary` — extracts structured meaning after a call ends

```typescript
// supabase/functions/process-call-summary/index.ts
//
// Call this when a call ends (Getello webhook, or your own polling job)
// with { call_id, transcript }. It uses Claude to extract a structured
// summary, saves it, and — if the customer asked for a callback or showed
// interest — automatically schedules the next call.
//
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { call_id, transcript } = await req.json();

    const { data: call, error: callErr } = await supabase
      .from("calls")
      .select("*, businesses(default_callback_hours)")
      .eq("id", call_id)
      .single();
    if (callErr || !call) throw new Error("Call not found");

    // Save raw transcript + mark completed
    await supabase.from("calls")
      .update({ raw_transcript: transcript, call_status: "completed", ended_at: new Date().toISOString() })
      .eq("id", call_id);

    const defaultHours = call.businesses?.default_callback_hours ?? 24;

    const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 600,
        messages: [{
          role: "user",
          content:
`Extract a structured summary from this sales call transcript.
Return ONLY valid JSON — no preamble, no markdown fences — in exactly this shape:

{
  "summary_text": string,
  "disposition": "interested" | "callback_requested" | "not_interested" | "converted" | "lost",
  "structured_data": {
    "interest_level": string,
    "budget_window": string,
    "project_size": string,
    "objections": string[],
    "sentiment": string
  },
  "next_action": string,
  "suggested_next_call_hours": number  // if the customer gave a cue ("call tomorrow",
                                        // "next week") reflect it in hours; otherwise use ${defaultHours}
}

Transcript:
${transcript}`
        }],
      }),
    });

    const claudeData = await claudeResp.json();
    const textBlock = claudeData.content?.find((b: { type: string }) => b.type === "text");
    const cleaned = (textBlock?.text ?? "{}").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const nextCallAt = new Date(
      Date.now() + (parsed.suggested_next_call_hours ?? defaultHours) * 3600 * 1000
    ).toISOString();

    await supabase.from("call_summaries").insert({
      call_id,
      summary_text: parsed.summary_text,
      structured_data: parsed.structured_data,
      disposition: parsed.disposition,
      next_action: parsed.next_action,
      next_call_at: nextCallAt,
    });

    // Auto-schedule the next call for anything still live in the pipeline
    if (["interested", "callback_requested"].includes(parsed.disposition)) {
      await supabase.from("scheduled_callbacks").insert({
        business_id: call.business_id,
        customer_id: call.customer_id,
        lead_id: call.lead_id,
        scheduled_time: nextCallAt,
      });
    }

    return new Response(JSON.stringify({ ok: true, disposition: parsed.disposition, next_call_at: nextCallAt }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

```

### 6.3 `dispatch-callbacks` — the automatic re-dial loop

```typescript
// supabase/functions/dispatch-callbacks/index.ts
//
// Runs on a schedule (see cron.sql below). Finds every scheduled_callback
// that's now due, fires trigger-call for it, and marks it triggered.
// This is the piece that makes "call me later" actually happen without
// anyone touching a dashboard.

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (_req) => {
  const now = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("scheduled_callbacks")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_time", now)
    .limit(50); // batch size per run

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  const results = [];
  for (const cb of due ?? []) {
    // Mark triggered first to avoid double-dialing if this run overlaps the next
    await supabase.from("scheduled_callbacks")
      .update({ status: "triggered", attempt_count: cb.attempt_count + 1 })
      .eq("id", cb.id);

    const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/trigger-call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        customer_id: cb.customer_id,
        business_id: cb.business_id,
        lead_id: cb.lead_id,
      }),
    });
    results.push({ callback_id: cb.id, ok: resp.ok });

    if (resp.ok) {
      await supabase.from("scheduled_callbacks").update({ status: "completed" }).eq("id", cb.id);
    }
  }

  return new Response(JSON.stringify({ ok: true, dispatched: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});

```

### 6.4 `update-agent-prompt` — pushes a new system prompt with version history

```typescript
// supabase/functions/update-agent-prompt/index.ts
//
// Pushes a new system prompt to a business's Getello agent and records
// it in agent_prompts for version history / rollback. Call this from
// the Admin Dashboard's prompt-editor screen (or the Web Dashboard's
// Settings screen, if business owners are allowed to edit their own
// agent's prompt).
//
// NOTE: the Getello endpoint is PUT /api/agents/{agent_id} — a plain
// server-to-server PUT. The "Access-Control-Request-Method: PUT" header
// sometimes seen in captured requests is a browser CORS-preflight
// artifact; it is not sent here because this call never runs in a browser.
//
// Secrets needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { business_id, prompt_text, prompt_type = "hybrid", pushed_by } = await req.json();
    if (!business_id || !prompt_text) {
      throw new Error("business_id and prompt_text are required");
    }

    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", business_id)
      .single();
    if (bizErr || !business) throw new Error("Business not found");

    // Getello key from Vault — never hardcoded, never client-supplied
    const { data: secretRow, error: secretErr } = await supabase
      .schema("vault")
      .from("decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", business.getello_api_key_secret_name)
      .single();
    if (secretErr || !secretRow) throw new Error("Getello key not found in Vault");
    const getelloApiKey = secretRow.decrypted_secret;

    const resp = await fetch(
      `https://api-in.getello.ai/api/agents/${business.getello_agent_id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": getelloApiKey,
        },
        body: JSON.stringify({ type: prompt_type, prompt: prompt_text }),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Getello prompt update failed: ${resp.status} ${errText}`);
    }

    // Deactivate the previous version, then record this one as active.
    // (Kept as two statements for clarity; wrap in a transaction/RPC in production.)
    await supabase.from("agent_prompts")
      .update({ is_active: false })
      .eq("business_id", business_id)
      .eq("is_active", true);

    const { data: version, error: insertErr } = await supabase
      .from("agent_prompts")
      .insert({
        business_id,
        prompt_text,
        prompt_type,
        pushed_by: pushed_by ?? null,
        is_active: true,
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ ok: true, version_id: version.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

```

**Definition of Done — Phase: Edge Functions**
- [ ] All four functions deploy without error
- [ ] `trigger-call` successfully places a real test call against a live Getello agent
- [ ] `process-call-summary` returns valid JSON matching the schema for a sample transcript
- [ ] `dispatch-callbacks` correctly no-ops when `scheduled_callbacks` is empty
- [ ] `update-agent-prompt` correctly deactivates the prior `agent_prompts` row before inserting the new one

---

## 7. Scheduler Setup

Run once, after `dispatch-callbacks` is deployed (requires `pg_cron` and
`pg_net` extensions enabled under Database → Extensions):

```sql
-- Run once in the Supabase SQL Editor after deploying dispatch-callbacks.
-- Requires the pg_cron and pg_net extensions (enable both under
-- Database > Extensions in the Supabase dashboard first).

select cron.schedule(
  'dispatch-pending-callbacks',
  '*/10 * * * *',  -- every 10 minutes; tighten if you need faster callback SLAs
  $$
  select net.http_post(
    url := 'https://<your-project-ref>.supabase.co/functions/v1/dispatch-callbacks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <your-service-role-key>'
    )
  );
  $$
);

-- To inspect scheduled jobs:  select * from cron.job;
-- To remove it later:        select cron.unschedule('dispatch-pending-callbacks');

```

**Definition of Done**
- [ ] `select * from cron.job;` shows the scheduled job
- [ ] A manually-inserted due row in `scheduled_callbacks` gets picked up and dialed within one cron interval

---

## 8. Voice Agent System Prompt

This is the system prompt to push to the Getello agent via
`update-agent-prompt` (§6.4 / §9). It implements the first-call vs.
repeat-call branching that makes the memory behavior work.

```
ROLE & PERSONA

You are Priya, a real-estate enquiry specialist calling on behalf of
{{business_name}}. Warm, concise, consultative -- never pushy. Speak
naturally, the way a helpful person would on the phone, not like you
are reading a script.

CONTEXT VARIABLES AVAILABLE TO YOU
user_name, phonenumber, project_type, default_description,
special_attractions, scheduledDateTime, preferred_language,
is_repeat_call, previous_call_summary, previous_disposition,
previous_structured_data

OPENING LOGIC
IF is_repeat_call is false:
    -> use FIRST-CALL OPENING
ELSE:
    -> use REPEAT-CALL OPENING, grounded in previous_call_summary,
       previous_disposition and previous_structured_data

FIRST-CALL OPENING
- Greet {{user_name}} by name; state who you are and why you're
  calling, referencing the specific project_type they enquired about.
- Paraphrase default_description in your own words -- never read it
  verbatim.
- Mention two or three items from special_attractions that best
  match what the customer seems to want, not the full list.
- Move into discovery: budget range, timeline, purpose (investment
  or end-use), preferred size/location.
- On an objection (busy, browsing, budget mismatch), acknowledge it
  briefly and offer a concrete next step rather than pushing further.
- Before ending, state the agreed next step out loud in your own
  words -- a callback time, a site-visit date, or not interested.

REPEAT-CALL OPENING (is_repeat_call = true)
- Open with a natural reference to the earlier call -- do not
  reintroduce yourself or the project from scratch.
  e.g. "Hi {{user_name}}, this is Priya again -- I'd called earlier
  but I know you didn't have the time then. Do you have a couple of
  minutes now?"
- If previous_structured_data has specific facts (budget window,
  project size, preferred location), restate them back to the
  customer as confirmation rather than asking again.
  e.g. "Last time you'd mentioned a budget window of around a year,
  with a project size closer to three to four years -- is that
  still where things stand?"
- If the customer updates or corrects a fact, acknowledge the
  change explicitly and adjust -- do not silently overwrite it.
  e.g. "Got it -- so you're now looking at a one-year window with
  some extra budget available. That opens up financing options we
  can walk through."
- Use previous_disposition to decide how far to move things
  forward: callback_requested -> pick up where you left off;
  interested -> move toward a concrete next step (site visit,
  documents, financing).
- Close the same way as a first call: state the agreed next step
  out loud.

QUALIFICATION FRAMEWORK
Budget       - approximate range and flexibility
Timeline     - when they intend to act, not just "someday"
Purpose      - investment vs. end-use, which changes what matters
Authority    - sole decision-maker, or deciding with family/partners

OBJECTION HANDLING
"Not interested"       -> respect it; ask permission before any
                          future contact; do not re-pitch
"Call me later"        -> confirm a specific window if given;
                          otherwise the system defaults to the
                          same time on the next business day
"Send details on         -> confirm the channel and record it as
 WhatsApp/email"           the next action

TONE, LANGUAGE & TTS RULES
- Respond in preferred_language; handle code-mixed speech naturally
  without correcting how the customer mixes languages.
- Keep sentences short and speakable; avoid parentheticals or
  written-only punctuation that does not read naturally aloud.
- Speak numbers, dates and currency the way a person would say
  them, not digit-by-digit.

CLOSING REQUIREMENT
- Always state the agreed next step out loud before ending the
  call, so the transcript contains an unambiguous outcome for
  process-call-summary to extract.
```

### 8.1 Deploying the prompt

Call `update-agent-prompt` with:
```json
{ "business_id": "<uuid>", "prompt_text": "<the prompt above>", "prompt_type": "hybrid" }
```

**OPEN QUESTION:** this assumes Getello interpolates `{{variable}}`
placeholders in the prompt from `context_data` at call time. Confirm this
against Getello's own documentation before relying on it — if unsupported,
the variables must be woven into `prompt_text` server-side (in
`trigger-call` or a new step before it) instead of left as literal
placeholders.

**Definition of Done**
- [ ] Prompt successfully pushed via `update-agent-prompt`
- [ ] `agent_prompts` shows exactly one `is_active = true` row per business
- [ ] A live first-call test matches the FIRST-CALL OPENING behavior
- [ ] A live repeat-call test (after a callback_requested disposition) matches the REPEAT-CALL OPENING behavior and correctly references the prior summary

---

## 9. Website — Contact-Us Lead Capture

**Form fields:** name, phone, email, project type (dropdown sourced from
`project_types`, showing its `default_description` and `special_attractions`
read-only once selected), preferred callback date/time, preferred call
language (English / Telugu / Hindi / Tamil / Marathi), free-text message,
and a **required** consent checkbox authorizing an outbound call.

**Submission never writes to the database directly from the browser.** It
posts to a server route that validates, rate-limits, and only then writes:

```typescript
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

```

**Definition of Done**
- [ ] Form rejects submission when consent is unchecked
- [ ] Duplicate phone number within the rate-limit window is rejected with a 429
- [ ] A valid submission creates exactly one `customers` row (upserted, not duplicated) and one `leads` row
- [ ] A valid submission triggers `trigger-call` and a `calls` row appears

---

## 10. Business Web Dashboard

Screens (all Supabase queries scoped by RLS to the signed-in owner's `business_id`):

| Screen | Data | Key queries |
|---|---|---|
| Overview | Calls today/this week, conversion rate, callbacks due | Aggregate over `calls`, `call_summaries` |
| Leads & Calls log | Filterable table | `calls` joined to `customers`, `call_summaries` |
| Customer detail | Full call timeline | `calls` + `call_summaries` for one `customer_id`, ordered by `started_at` |
| Pipeline (Kanban) | Grouped by disposition | `call_summaries.disposition` |
| Callback calendar | Upcoming auto re-dials | `scheduled_callbacks` where `status = 'pending'` |
| Settings | Edit project type defaults, callback hours | `project_types`, `businesses.default_callback_hours` |

**Definition of Done**
- [ ] A logged-in owner sees only their own business's data (verify RLS by attempting a cross-tenant query and confirming it returns empty)
- [ ] Pipeline view correctly buckets every `call_summaries.disposition` value
- [ ] Callback calendar matches the contents of `scheduled_callbacks`

---

## 11. Admin Dashboard (Super-Admin / Ops)

| Screen | Purpose |
|---|---|
| Business onboarding | Create a `businesses` row, assign `getello_agent_id`, store the Getello key in Vault |
| Cross-tenant overview | Call volume, error rate, pipeline health across every business |
| System health | Edge Function error rates, failed Getello calls, `scheduled_callbacks` queue depth |
| Role management | Owner / staff / admin via Supabase Auth custom claims |
| Prompt editor | Edit and push a business's system prompt via `update-agent-prompt`; view `agent_prompts` history; rollback to a previous version |

Access to this app must be gated by a role claim, not just being logged in
— a plain Supabase Auth session is not sufficient to reach cross-tenant data.

**Definition of Done**
- [ ] A non-admin user cannot load any admin route
- [ ] Onboarding a new business results in a working `trigger-call` for that tenant
- [ ] Prompt rollback correctly restores a previous `agent_prompts` version as active on Getello

---

## 12. Compliance Guardrails (enforce these while building, do not defer)

- Consent checkbox is mandatory on the intake form; store a timestamp for it
  (add `consent_given_at` to `leads` if not already present).
- Calling hours: `dispatch-callbacks` must not fire outside a permitted
  window (commonly 9 AM–9 PM IST) — add this guard before go-live.
- Opt-out: a customer flag that immediately cancels all pending
  `scheduled_callbacks` for them and blocks future `trigger-call` calls.
- DND / DLT registration: confirm the business's telemarketer registration
  category before enabling production outbound calling.
- Never log secrets. Never return a Getello key or the Supabase
  service-role key in any API response, error message, or client bundle.

---

## 13. Build Sequence

| Phase | Scope | Depends On |
|---|---|---|
| 0 | Repo scaffold, Supabase project, CI/CD | — |
| 1 | Schema (§5) | Phase 0 |
| 2 | Edge Functions (§6) | Phase 1 |
| 3 | Scheduler (§7) | Phase 2 |
| 4 | Voice agent prompt live on Getello (§8) | Phase 2 |
| 5 | Website + intake route (§9) | Phase 2 |
| 6 | Business dashboard (§10) | Phase 1 |
| 7 | Admin dashboard (§11) | Phases 1, 6 |
| 8 | Compliance guardrails (§12) | Phases 3, 5 |
| 9 | End-to-end test: the two-call scenario in §14 | Phases 1–8 |
| 10 | Production deploy | Phase 9 passing |

---

## 14. Acceptance Test — The Scenario This System Is Built Around

1. Submit the website form as "Priya" for an Office Spaces lead, with consent checked.
2. Confirm a `calls` row appears and the call is placed (Call 1).
3. During the call, simulate: customer is interested but has no time now.
4. Confirm `call_summaries.disposition = 'callback_requested'` and a `scheduled_callbacks` row is created for the following day.
5. Advance time (or wait) to the scheduled time; confirm `dispatch-callbacks` fires Call 2 automatically without manual intervention.
6. Confirm Call 2's `context_data_sent.is_repeat_call = true` and includes `previous_call_summary` / `previous_structured_data` from Call 1.
7. Confirm the agent's opening in Call 2 references the prior call rather than re-introducing the project from scratch.

If all seven steps pass, the core memory-and-callback loop is working end to end.

---

## 15. Non-Goals (explicit — do not build these as part of this brief)

- Payment processing or invoicing
- CRM data migration from any existing system
- Getello's own internal telephony/LLM configuration
- Anything in §16 below — those are deliberately deferred past MVP

---

## 16. Scalability Roadmap — Gaps Beyond MVP

Everything above produces a working system for a modest number of tenants
and calls. The items below are what stand between that and a fully scalable,
production-hardened platform. None of them block an initial launch; all of
them should be tracked as follow-on work.

| Category | Gap | Why It Matters At Scale | Recommendation |
|---|---|---|---|
| Call dispatch | `dispatch-callbacks` is a single polling function on a fixed pg_cron interval | Fine at hundreds of callbacks; at tens of thousands, a single 10-minute batch creates thundering-herd load and delay | Move to a proper queue (Supabase Queues / pgmq, or an external queue) with multiple consumers, or shard dispatch by business_id |
| Concurrency | No idempotency guard beyond a status flip before dialing | Overlapping cron runs or retried invocations could double-dial under load | Add a unique constraint / advisory lock per `scheduled_callbacks.id` during dispatch |
| Getello rate limits | No backoff/retry/circuit-breaker around Getello calls | Getello likely rate-limits per API key; a burst of triggered calls could start failing silently | Add exponential backoff, a circuit breaker, and per-business concurrency caps |
| Data growth | `calls`, `call_summaries`, and `raw_transcript` grow unbounded | Multi-year transcript storage in the primary OLTP database degrades query performance and inflates backup size | Partition `calls`/`call_summaries` by month; move old transcripts to cold storage (e.g. Supabase Storage or S3) after a retention window |
| Analytics | Dashboard queries run directly against the OLTP tables | Aggregate/reporting queries (conversion rate, cost-per-call) compete with live traffic as volume grows | Add materialized views or a read replica; consider a dedicated analytics store (e.g. a Postgres read replica or ClickHouse) once per-business call volume is high |
| Multi-tenancy isolation | RLS alone separates tenants | Sufficient for many small/medium tenants; a single very large enterprise tenant may need stronger isolation for compliance or performance reasons | Offer a dedicated-schema or dedicated-project tier for large tenants if/when one appears |
| Observability | Only basic Edge Function logs assumed | At scale, diagnosing a failed call chain (website → trigger-call → Getello → process-call-summary) needs correlation | Add structured logging with a shared request/correlation ID across all four functions, shipped to a log platform (e.g. Logflare, Datadog) |
| Secrets at scale | Vault holds one key per business, rotated manually | Manual rotation doesn't scale past a handful of tenants | Build a rotation workflow/API in the admin dashboard (already scoped in §11) with scheduled reminders or automation |
| Prompt rollout | `agent_prompts` supports versioning but not gradual rollout | Pushing a new prompt affects 100% of calls immediately; a regression is expensive to detect and revert quickly | Add an A/B or canary mechanism — e.g. route a percentage of calls to a candidate prompt version and compare disposition/conversion rates before full rollout |
| Public intake abuse | In-memory rate limiting in the website's API route | Resets on every redeploy and doesn't work across multiple server instances | Move to Redis/Upstash-backed rate limiting, plus CAPTCHA/hCaptcha on the form |
| Deployment | No staging environment or blue-green deploy path specified | Riskier production changes as the system and team grow | Add a staging Supabase project + Vercel preview environments to the CI/CD pipeline before scaling the team |
| Disaster recovery | Relies on Supabase's default point-in-time recovery | No explicit RPO/RTO target or cross-region backup strategy defined | Define and test an explicit backup/restore runbook, including a cross-region backup if data residency rules allow |
| Cost modeling | No per-call cost tracking (Getello minutes + Claude tokens) | Cost scales linearly with call volume; invisible until a large bill arrives | Log estimated cost per call in `calls` or `call_summaries` and surface it in the dashboard's analytics view |
| Compliance at scale | DND/calling-hours checks are per-business config, not centrally enforced or audited | As tenant count grows, one misconfigured business creates regulatory exposure for the whole platform | Add a platform-level compliance audit job that flags any business missing required consent/DND/calling-hours configuration |

**How to use this table:** none of these are prerequisites for a first
working deployment (§13–§14). Treat them as the backlog for the phase after
MVP validation — the natural trigger for most of them is a specific,
measured pain point (queue backlog, a slow dashboard query, a Getello rate
limit error) rather than pre-optimizing before it's needed.
