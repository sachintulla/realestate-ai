-- =========================================================
-- supabase/migrations/0005_role_grants.sql
-- =========================================================
-- The §5 schema created its tables via raw SQL and never granted privileges to
-- the Supabase API roles. PostgREST and the edge functions (all using
-- service_role) therefore get 42501 "permission denied for table ...". Supabase
-- normally auto-grants when tables are made via the dashboard; explicit
-- migrations must do it themselves. RLS still governs row visibility for
-- anon/authenticated.

grant usage on schema public to anon, authenticated, service_role;

-- service_role: the trusted server key used by the website intake route and all
-- four edge functions. Bypasses RLS; needs full DML on every table.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- authenticated: the business dashboard (§10) reads/writes its own rows. Every
-- business-owned table has RLS enabled, so access stays row-scoped to the owner.
-- project_types is intentionally omitted (RLS off; template writes stay
-- service-role only) beyond the anon/authenticated SELECT granted in 0004.
grant select, insert, update, delete on
  businesses, leads, customers, calls, call_summaries, scheduled_callbacks, agent_prompts
  to authenticated;
