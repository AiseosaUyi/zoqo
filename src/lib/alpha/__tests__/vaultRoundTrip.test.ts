import { describe, expect, it } from "vitest";
// Node 20 (this repo's baseline) has no native WebSocket global;
// @supabase/supabase-js's realtime client construction needs the
// constructor to exist even though this file never opens a socket —
// same test-runtime-only shim as providers-apiFootball.test.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = (globalThis as any).WebSocket ?? class {};
import { createServiceRoleClient } from "@/lib/supabase/server";
import { setVenueCredentials } from "../service";
import { getVenueSecret } from "../secrets";

/** Supabase Vault round trip (docs/alpha/PROMPT-alpha-finish.md §3):
 *  store a dummy value via `service.setVenueCredentials` (→
 *  `alpha_store_secret`), read it back via `secrets.ts`'s `getVenueSecret`
 *  (→ `alpha_read_secret`), assert it matches and that `broker_credentials.
 *  secret_ref` is a real `vault:<uuid>` rather than the `vault:pending:
 *  <uuid>` placeholder Phase 4 shipped before this migration existed.
 *
 *  `supabase/migrations/20260914010000_alpha_vault_secrets.sql` is now
 *  applied to the linked project (2026-09-14 — see docs/alpha/STATUS.md),
 *  so this runs for real whenever `SUPABASE_SERVICE_ROLE_KEY`/
 *  `NEXT_PUBLIC_SUPABASE_URL` are loaded — i.e. under
 *  `node --env-file=.env.local node_modules/.bin/vitest run`, this repo's
 *  standard manual command for exercising real credentials (`npm run
 *  test:unit` never loads `.env.local`, so CI stays credential-free and
 *  this cleanly skips there). Uses whichever real auth user is first in
 *  `auth.admin.listUsers()` and a `broker_credentials` row scoped to that
 *  (user_id, venue) pair only — any pre-existing row for that pair is
 *  snapshotted before the test and restored (or deleted, if none existed)
 *  after, so this never leaves residue or disturbs a real configured
 *  credential. */
const hasLiveCreds = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const test = hasLiveCreds ? it : it.skip;

describe(`Supabase Vault round trip for venue credentials${hasLiveCreds ? "" : " (skipped: no SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL loaded — run with node --env-file=.env.local)"}`, () => {
  test("stores a dummy secret via alpha_store_secret and reads it back via alpha_read_secret", async () => {
    const supabase = createServiceRoleClient();
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError || !usersData?.users?.length) throw new Error(`no real auth user available to test against: ${usersError?.message ?? "empty user list"}`);
    const userId = usersData.users[0].id;
    const venue = "bybit-demo" as const;

    const { data: before } = await supabase.from("broker_credentials").select("*").eq("user_id", userId).eq("broker", venue).maybeSingle();

    try {
      const dummySecret = `test-vault-roundtrip-${crypto.randomUUID()}`;
      const result = await setVenueCredentials(supabase, userId, { venue, secret: dummySecret });
      expect(result.ok).toBe(true);

      const { data: row } = await supabase.from("broker_credentials").select("secret_ref").eq("user_id", userId).eq("broker", venue).single();
      expect(row?.secret_ref).toMatch(/^vault:[0-9a-f-]{36}$/); // a real Vault ref, not "vault:pending:<uuid>"

      const readBack = await getVenueSecret(userId, venue);
      expect(readBack).toBe(dummySecret);
    } finally {
      if (before) {
        await supabase.from("broker_credentials").update({ secret_ref: before.secret_ref, scope: before.scope }).eq("id", before.id);
      } else {
        await supabase.from("broker_credentials").delete().eq("user_id", userId).eq("broker", venue);
      }
    }
  });
});
