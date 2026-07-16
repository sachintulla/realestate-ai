# realestate-ai

Ello AI **Real Estate Voice Agent Ecosystem** — a monorepo containing the
public website, business dashboard, admin dashboard, and Supabase backend for
an AI voice agent that automatically calls and follows up with real-estate
leads.

> **Full build brief:** [`docs/AI_BUILD_GUIDE.md`](docs/AI_BUILD_GUIDE.md) —
> the authoritative, phase-by-phase spec (schema, edge functions, prompts,
> compliance). Build to it exactly.

## What's here

This repo is currently at **Phase 0 (scaffold)**. Application logic for the
edge functions, database schema, and dashboard screens is stubbed with
pointers to the guide section where each is fully specified.

| Path | Purpose | Spec |
|---|---|---|
| `apps/website` | Public site + Contact-Us intake (port `3000`) | §9 |
| `apps/dashboard` | Business-owner dashboard (port `3001`) | §10 |
| `apps/admin` | Super-admin / ops dashboard (port `3002`) | §11 |
| `supabase/migrations/0001_init.sql` | Database schema (8 tables, RLS, seeds) | §5 |
| `supabase/functions/*` | Four Deno edge functions | §6 |
| `supabase/cron.sql` | pg_cron re-dial schedule | §7 |
| `docs/AI_BUILD_GUIDE.md` | The complete build brief | — |

## Tech stack

Next.js 15 (App Router) + TypeScript + Tailwind CSS · Supabase (Postgres,
Auth, Vault, Edge Functions) · Recharts · Anthropic Claude API · Getello
telephonic API. See §2 of the guide for the fixed stack.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`corepack enable` to get it, or `npm i -g pnpm`)
- A **Supabase** project (for the backend; not required to run the apps locally)
- The **Supabase CLI** (optional — for running migrations / deploying functions)

## Local setup

```bash
# 1. Install all workspace dependencies (from the repo root)
pnpm install

# 2. Configure environment variables
#    Copy the example and fill in your own values — never commit real secrets.
cp .env.example apps/website/.env.local
cp .env.example apps/dashboard/.env.local
cp .env.example apps/admin/.env.local
#    Then edit each .env.local. See docs/AI_BUILD_GUIDE.md §4 for what each
#    variable is and which app/function uses it.

# 3. Run an app in dev
pnpm dev:website      # http://localhost:3000
pnpm dev:dashboard    # http://localhost:3001
pnpm dev:admin        # http://localhost:3002

# ...or run all three at once
pnpm dev
```

### Other useful scripts (run from the repo root)

```bash
pnpm lint         # ESLint across all apps
pnpm typecheck    # tsc --noEmit across all apps
pnpm build        # next build across all apps
```

Each command also works per app via pnpm filters, e.g.
`pnpm --filter @realestate-ai/dashboard lint`.

## Backend (Supabase)

The schema, edge functions, and scheduler are **not** applied by
`pnpm install`. Once their Phase 1–3 implementations land (per the guide),
apply them with the Supabase CLI:

```bash
supabase db push                                   # apply migrations (§5)
supabase functions deploy trigger-call             # §6.1
supabase functions deploy process-call-summary     # §6.2
supabase functions deploy dispatch-callbacks       # §6.3
supabase functions deploy update-agent-prompt      # §6.4
# then run supabase/cron.sql once in the SQL editor (§7)
```

## Continuous integration

`.github/workflows/ci.yml` runs **lint + typecheck** for each of the three
apps on every push and pull request.

## Repository layout

```
apps/
  website/    dashboard/    admin/
supabase/
  migrations/   functions/   cron.sql
docs/
  AI_BUILD_GUIDE.md
```
