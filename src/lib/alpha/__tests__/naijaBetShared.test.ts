import { describe, expect, it } from "vitest";
import { matchFixture, LEAGUE_ID_MAP, type FixtureCandidate } from "../providers/naijaBetShared";

describe("matchFixture (first-cut token-overlap matcher, not real entity resolution)", () => {
  const candidates: FixtureCandidate[] = [
    { id: "f1", home_team: "Leeds United", away_team: "Newcastle United", kickoff_at: "2026-09-14T19:00:00.000Z" },
    { id: "f2", home_team: "Manchester City", away_team: "Arsenal", kickoff_at: "2026-09-14T14:00:00.000Z" },
  ];

  it("matches on shorthand team names within the kickoff window", () => {
    const result = matchFixture({ homeTeam: "Leeds Utd", awayTeam: "Newcastle Utd", kickoffAtMs: new Date("2026-09-14T19:00:00.000Z").getTime() }, candidates);
    expect(result?.id).toBe("f1");
  });

  it("returns null when team names don't overlap enough, even at the right kickoff time", () => {
    const result = matchFixture({ homeTeam: "Real Madrid", awayTeam: "Barcelona", kickoffAtMs: new Date("2026-09-14T19:00:00.000Z").getTime() }, candidates);
    expect(result).toBeNull();
  });

  it("returns null when the kickoff time is outside the matching window, even with identical team names", () => {
    const result = matchFixture({ homeTeam: "Leeds United", awayTeam: "Newcastle United", kickoffAtMs: new Date("2026-09-16T19:00:00.000Z").getTime() }, candidates);
    expect(result).toBeNull();
  });

  it("picks the best-scoring candidate when more than one clears the threshold", () => {
    const ambiguous: FixtureCandidate[] = [
      // Partial overlap on the away side only ("west" doesn't appear in "Arsenal") — clears the
      // threshold (home matches fully) but scores lower than the exact match below.
      { id: "partial", home_team: "Manchester City", away_team: "West Arsenal", kickoff_at: "2026-09-14T14:00:00.000Z" },
      { id: "exact", home_team: "Manchester City", away_team: "Arsenal", kickoff_at: "2026-09-14T14:00:00.000Z" },
    ];
    const result = matchFixture({ homeTeam: "Manchester City", awayTeam: "Arsenal", kickoffAtMs: new Date("2026-09-14T14:00:00.000Z").getTime() }, ambiguous);
    expect(result?.id).toBe("exact");
  });
});

describe("LEAGUE_ID_MAP", () => {
  it("covers the 5 of alpha-ingest's 6 default leagues Bet9ja/Nairabet actually carry", () => {
    // "2" is UCL (API-Football) — NaijaBet_Api's Betid enum has no UCL id for either bookmaker.
    expect(Object.keys(LEAGUE_ID_MAP).sort()).toEqual(["135", "140", "39", "61", "78"]);
  });
});
