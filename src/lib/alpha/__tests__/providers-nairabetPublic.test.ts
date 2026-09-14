import { describe, expect, it } from "vitest";
import { normalizeNairabetEnvelope } from "../providers/nairabetPublic";
import type { FixtureCandidate } from "../providers/naijaBetShared";

/** Unlike bet9jaPublic.test.ts, this response shape is NOT verified against
 *  a live capture — `sports-api.nairabet.com` doesn't resolve from this
 *  development sandbox (nairabetPublic.ts's own header explains why in
 *  detail). This fixture is built from NaijaBet_Api's own documented
 *  jmespath query (`utils/jsonpaths.py`'s `nairabet_search_string`) and its
 *  own end-to-end test assertions (`tests/test_nairabet_e2e.py`), not
 *  invented from scratch. */
describe("normalizeNairabetEnvelope (documented shape — unreachable from this sandbox, see module header)", () => {
  const raw = {
    data: {
      categories: [
        {
          competitions: [
            {
              events: [
                {
                  eventNames: ["Arsenal", "Manchester City"],
                  startTime: "2026-09-14T14:00:00.000Z",
                  id: 12345,
                  markets: [{ outcomes: [{ value: "2.10" }, { value: "3.40" }, { value: "3.20" }] }],
                },
                {
                  // Malformed / partial event — must be skipped, not crash.
                  eventNames: ["Only One Team"],
                  startTime: "2026-09-15T14:00:00.000Z",
                  id: 999,
                  markets: [],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const candidates: FixtureCandidate[] = [{ id: "af-ars-mci", home_team: "Arsenal", away_team: "Man City", kickoff_at: "2026-09-14T14:00:00.000Z" }];

  it("matches and normalizes a well-formed event into 1x2 snapshots", () => {
    const result = normalizeNairabetEnvelope(raw, candidates, "2026-09-13T23:00:00.000Z");
    expect(result).toEqual([
      { fixtureId: "af-ars-mci", book: "nairabet", market: "1x2", outcome: "home", decimalOdds: 2.1, ts: "2026-09-13T23:00:00.000Z" },
      { fixtureId: "af-ars-mci", book: "nairabet", market: "1x2", outcome: "draw", decimalOdds: 3.4, ts: "2026-09-13T23:00:00.000Z" },
      { fixtureId: "af-ars-mci", book: "nairabet", market: "1x2", outcome: "away", decimalOdds: 3.2, ts: "2026-09-13T23:00:00.000Z" },
    ]);
  });

  it("skips an event with fewer than 2 team names rather than throwing", () => {
    const onlyMalformed = { data: { categories: [{ competitions: [{ events: [raw.data.categories[0].competitions[0].events[1]] }] }] } };
    expect(normalizeNairabetEnvelope(onlyMalformed, candidates)).toEqual([]);
  });

  it("returns [] for a response with no data at all", () => {
    expect(normalizeNairabetEnvelope({}, candidates)).toEqual([]);
  });
});
