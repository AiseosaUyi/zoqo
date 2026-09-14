import { describe, expect, it } from "vitest";
// Node 20 (this repo's baseline, see package.json) has no native WebSocket
// global; @supabase/supabase-js's realtime client construction needs the
// constructor to exist even though this file never opens a socket. Vercel
// production runs Node 24 (has one natively) — this stub is a test-runtime
// shim only, not a statement about the real app.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket = (globalThis as any).WebSocket ?? class {};
import { fetchFixtures, fetchFixtureById, fetchLineups, fetchInjuries, fetchFixturesByDateRange } from "../providers/apiFootball";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Without `API_FOOTBALL_KEY` set (the default for `npm run test:unit`,
 *  which doesn't load `.env.local`), every function here is only ever
 *  exercised on its "no key" path — each checks `apiKey` and returns
 *  before touching `checkAndConsume`/the network, so `supabase` can safely
 *  be `undefined` for these calls. */
describe("apiFootball (no API_FOOTBALL_KEY loaded — run with `node --env-file=.env.local` for the live section below)", () => {
  it("fetchFixtures returns [] without a key", async () => {
    const result = await fetchFixtures(null, undefined as never, { leagueId: "39", season: 2026 });
    expect(result).toEqual([]);
  });

  it("fetchFixtureById returns null without a key", async () => {
    const result = await fetchFixtureById(null, undefined as never, "12345");
    expect(result).toBeNull();
  });

  it("fetchLineups returns [] without a key", async () => {
    const result = await fetchLineups(null, undefined as never, "12345");
    expect(result).toEqual([]);
  });

  it("fetchInjuries returns [] without a key", async () => {
    const result = await fetchInjuries(null, undefined as never, "12345");
    expect(result).toEqual([]);
  });
});

/** Live conformance runs for real only when API_FOOTBALL_KEY is present
 *  (this repo's standard `npm run test:unit` doesn't load `.env.local`, so
 *  this always skips under that command — run with
 *  `node --env-file=.env.local node_modules/.bin/vitest run` to exercise
 *  it for real). Verified live 2026-09-14 against a real, active free-plan
 *  key: `fetchFixturesByDateRange` (the date-based query — see its own
 *  header in apiFootball.ts for why the old league+season query is dead on
 *  the free tier) found real current EPL fixtures, cross-confirmed against
 *  Bet9ja's own live odds feed for the same match on the same date. */
const apiKey = process.env.API_FOOTBALL_KEY ?? null;
const test = apiKey ? it : it.skip;
describe(`apiFootball live conformance${apiKey ? "" : " (skipped: API_FOOTBALL_KEY not loaded)"}`, () => {
  test("fetchFixturesByDateRange finds real fixtures for today, including at least one recognizable league", async () => {
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);
    const fixtures = await fetchFixturesByDateRange(apiKey, supabase, { from: today, to: today });
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      expect(typeof f.id).toBe("string");
      expect(typeof f.homeTeam).toBe("string");
      expect(typeof f.awayTeam).toBe("string");
    }
  }, 20000);

  test("fetchFixtures filters fetchFixturesByDateRange's result to one league id", async () => {
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);
    const all = await fetchFixturesByDateRange(apiKey, supabase, { from: today, to: today });
    const leagueIdToTry = all[0]?.leagueId ?? "39";
    const filtered = await fetchFixtures(apiKey, supabase, { leagueId: leagueIdToTry, season: 2026, from: today, to: today });
    expect(filtered.every((f) => f.leagueId === leagueIdToTry)).toBe(true);
  }, 20000);
});
