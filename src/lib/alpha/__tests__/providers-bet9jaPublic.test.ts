import { describe, expect, it } from "vitest";
import { normalizeBet9jaEnvelope } from "../providers/bet9jaPublic";
import realSample from "../__fixtures__/bet9ja-epl-sample.json";
import type { FixtureCandidate } from "../providers/naijaBetShared";

/** `bet9ja-epl-sample.json` is a REAL, LIVE captured response — 2 events
 *  from `https://sports.bet9ja.com/desktop/feapi/PalimpsestAjax/
 *  GetEventsInGroupV2?GROUPID=170880&DISP=0&GROUPMARKETID=1&matches=true`,
 *  fetched from this machine on 2026-09-13 (English Premier League: Leeds
 *  Utd vs Newcastle Utd 2026-09-14, Brentford vs Chelsea 2026-09-18 — real
 *  fixtures, real decimal odds, at the time of capture). Unlike
 *  `__fixtures__/sample-fixtures.json`, this is not synthetic — it exists
 *  to prove `normalizeBet9jaEnvelope` parses the real shape correctly
 *  without needing network access on every test run. */
describe("normalizeBet9jaEnvelope (real captured Bet9ja response)", () => {
  const candidates: FixtureCandidate[] = [
    // API-Football's own naming convention differs from Bet9ja's shorthand
    // ("Leeds United" vs "Leeds Utd") — this is exactly what matchFixture's
    // token-overlap matcher exists to bridge.
    { id: "af-leeds-newcastle", home_team: "Leeds United", away_team: "Newcastle United", kickoff_at: "2026-09-14T19:00:00.000Z" },
    { id: "af-brentford-chelsea", home_team: "Brentford", away_team: "Chelsea", kickoff_at: "2026-09-18T19:00:00.000Z" },
    // A same-week fixture with no real name overlap — must never match.
    { id: "af-unrelated", home_team: "Real Madrid", away_team: "Barcelona", kickoff_at: "2026-09-14T19:00:00.000Z" },
  ];

  it("matches real Bet9ja events to the right alpha_fixtures candidate despite shorthand team names", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeBet9jaEnvelope(realSample as any, candidates, "2026-09-13T23:00:00.000Z");
    const fixtureIds = new Set(result.map((r) => r.fixtureId));
    expect(fixtureIds).toEqual(new Set(["af-leeds-newcastle", "af-brentford-chelsea"]));
    expect(result.some((r) => r.fixtureId === "af-unrelated")).toBe(false);
  });

  it("extracts real 1X2, double-chance, and O/U 2.5 odds for the matched fixture", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeBet9jaEnvelope(realSample as any, candidates, "2026-09-13T23:00:00.000Z");
    const leeds = result.filter((r) => r.fixtureId === "af-leeds-newcastle");
    expect(leeds).toContainEqual({ fixtureId: "af-leeds-newcastle", book: "bet9ja", market: "1x2", outcome: "home", decimalOdds: 2.38, ts: "2026-09-13T23:00:00.000Z" });
    expect(leeds).toContainEqual({ fixtureId: "af-leeds-newcastle", book: "bet9ja", market: "dc", outcome: "hd", decimalOdds: 1.4, ts: "2026-09-13T23:00:00.000Z" });
    expect(leeds).toContainEqual({ fixtureId: "af-leeds-newcastle", book: "bet9ja", market: "ou25", outcome: "over", decimalOdds: 1.77, ts: "2026-09-13T23:00:00.000Z" });
  });

  it("drops an event outside the kickoff-time matching window", () => {
    const farOff: FixtureCandidate[] = [{ id: "af-far", home_team: "Leeds United", away_team: "Newcastle United", kickoff_at: "2026-09-20T19:00:00.000Z" }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = normalizeBet9jaEnvelope(realSample as any, farOff, "2026-09-13T23:00:00.000Z");
    expect(result).toEqual([]);
  });
});
