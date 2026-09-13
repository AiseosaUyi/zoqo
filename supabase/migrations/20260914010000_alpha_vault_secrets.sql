-- ZOQO Alpha: real Supabase Vault round trip for venue credentials
-- (docs/alpha/PROMPT-alpha-finish.md §3). Replaces the
-- vault:pending:<uuid> placeholder src/lib/alpha/service.ts's
-- setVenueCredentials()/secrets.ts's getVenueSecret() have used since
-- Phase 4 (no Vault to write to in that build environment — see
-- docs/alpha/STATUS.md).
--
-- Two functions, both `security definer` so they run with the owning
-- role's privilege to reach the `vault` schema (not exposed to PostgREST
-- directly), and both revoked from every role except `service_role` —
-- this project's Alpha code always talks to Postgres via
-- createServiceRoleClient(), never a user-session client, for exactly this
-- kind of credential-adjacent call.
--
-- NOT YET APPLIED in this session: no SUPABASE_ACCESS_TOKEN / DB
-- connection string was available to run `supabase db push --linked` (see
-- docs/alpha/STATUS.md's "Needs Aise" list) — this migration is written and
-- committed but the live project's `vault` schema has never seen it exercised.
-- The round-trip Vitest (secrets.test.ts) is skipped with that exact reason
-- rather than faked.

create or replace function alpha_store_secret(name text, secret text)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  secret_id uuid;
begin
  secret_id := vault.create_secret(secret, name);
  return secret_id;
end;
$$;

revoke all on function alpha_store_secret(text, text) from public;
revoke all on function alpha_store_secret(text, text) from anon;
revoke all on function alpha_store_secret(text, text) from authenticated;
grant execute on function alpha_store_secret(text, text) to service_role;

-- Read side: `broker_credentials.secret_ref` stores `vault:<id>` once
-- `set_venue_credentials`/`/api/alpha/credentials` writes a real secret;
-- `secrets.ts`'s getVenueSecret() calls this by id to resolve it back to
-- plaintext for the one adapter call that needs it, never logging the
-- result (see that file's own comment).
create or replace function alpha_read_secret(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  plaintext text;
begin
  select decrypted_secret into plaintext from vault.decrypted_secrets where id = secret_id;
  return plaintext;
end;
$$;

revoke all on function alpha_read_secret(uuid) from public;
revoke all on function alpha_read_secret(uuid) from anon;
revoke all on function alpha_read_secret(uuid) from authenticated;
grant execute on function alpha_read_secret(uuid) to service_role;
