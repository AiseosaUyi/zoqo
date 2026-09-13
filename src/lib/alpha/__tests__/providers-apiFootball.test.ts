import { describe, expect, it } from "vitest";
import { fetchFixtures, fetchFixtureById, fetchLineups, fetchInjuries } from "../providers/apiFootball";

/** This environment has no `API_FOOTBALL_KEY` (docs/alpha/STATUS.md), so
 *  every one of these functions is only ever exercised on its "no key"
 *  path here — each function checks `apiKey` and returns before touching
 *  `checkAndConsume`/the network, so `supabase` can safely be `undefined`
 *  for these calls (documented in apiFootball.ts: "never throws... degrades
 *  to []/null when the key is absent"). A live-key conformance run is out
 *  of reach in this environment, per the task's standing rule. */
describe("apiFootball (no API_FOOTBALL_KEY in this environment)", () => {
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
