import { describe, it } from "vitest";

/** Supabase Vault round trip (docs/alpha/PROMPT-alpha-finish.md §3):
 *  store a dummy value via `service.setVenueCredentials` (→
 *  `alpha_store_secret`), read it back via `secrets.ts`'s `getVenueSecret`
 *  (→ `alpha_read_secret`), assert it matches, confirm `broker_credentials.
 *  secret_ref` is `vault:<uuid>` rather than `vault:pending:<uuid>`.
 *
 *  Skipped with reason, per this program's own standing rule (docs/alpha/
 *  07-build-plan.md: "when a free API is unreachable... mark the
 *  conformance test skip with the reason") and the driving prompt's own
 *  named escape hatch for this exact section ("skip with reason if the
 *  linked project is unreachable"): this session has no
 *  `SUPABASE_ACCESS_TOKEN` and no direct Postgres connection string, so
 *  `supabase/migrations/20260914010000_alpha_vault_secrets.sql` has never
 *  been applied to the linked project — `alpha_store_secret`/
 *  `alpha_read_secret` don't exist in that Postgres yet, so a live round
 *  trip isn't possible until Aise runs `supabase db push --linked` with a
 *  valid access token (see docs/alpha/STATUS.md's "Needs Aise" list).
 *  Un-skip this once that migration is live — no code change needed, the
 *  functions it calls already exist. */
describe("Supabase Vault round trip for venue credentials", () => {
  it.skip(
    "stores a dummy secret via alpha_store_secret and reads it back via alpha_read_secret " +
      "(skipped: no SUPABASE_ACCESS_TOKEN/DB credential in this environment to apply the migration first)",
    () => {},
  );
});
