-- =========================================================
-- supabase/migrations/0002_admin_vault_rpc.sql
-- =========================================================
-- Addition beyond AI_BUILD_GUIDE.md §5 (which had no programmatic Vault write).
-- §11 requires business onboarding to store the per-business Getello API key in
-- Supabase Vault from a SERVER-SIDE action. supabase-js cannot call the
-- `vault` schema directly, so this SECURITY DEFINER wrapper exposes a single,
-- tightly-scoped RPC that writes the secret. The raw key is passed in, stored
-- in Vault, and never returned or persisted in any regular column.
--
-- Callable by service_role only (the admin server action uses the service key).

create or replace function public.admin_create_getello_secret(
  p_secret text,
  p_name   text
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  perform vault.create_secret(p_secret, p_name);
  return p_name;
end;
$$;

revoke all on function public.admin_create_getello_secret(text, text) from public;
revoke all on function public.admin_create_getello_secret(text, text) from anon;
revoke all on function public.admin_create_getello_secret(text, text) from authenticated;
grant execute on function public.admin_create_getello_secret(text, text) to service_role;
