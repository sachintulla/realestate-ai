-- =========================================================
-- supabase/migrations/0003_compliance.sql
-- =========================================================
-- Compliance guardrails from AI_BUILD_GUIDE.md §12.
-- Kept as a separate, idempotent migration so 0001_init.sql stays verbatim to §5.

-- §12: store a timestamp for the mandatory intake consent checkbox.
alter table leads
  add column if not exists consent_given_at timestamptz;

-- §12: opt-out flag. When true, the customer must not be dialed and any
-- pending callbacks are cancelled (enforced in the opt-out route, trigger-call,
-- and dispatch-callbacks).
alter table customers
  add column if not exists opt_out boolean not null default false;
