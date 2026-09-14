import { describe, expect, it } from "vitest";
import { normalizeApiFootballOdds } from "../providers/apiFootballOdds";

describe("normalizeApiFootballOdds (documented v3 shape — no API_FOOTBALL_KEY in this environment)", () => {
  const raw = {
    response: [
      {
        fixture: { id: 1001 },
        bookmakers: [
          {
            id: 8,
            name: "Bet365",
            bets: [
              { id: 1, name: "Match Winner", values: [{ value: "Home", odd: "2.10" }, { value: "Draw", odd: "3.40" }, { value: "Away", odd: "3.20" }] },
              { id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.85" }, { value: "Under 2.5", odd: "1.95" }] },
            ],
          },
        ],
      },
    ],
  };

  it("maps Match Winner and Goals Over/Under bets into normalized 1x2/ou25 snapshots", () => {
    const result = normalizeApiFootballOdds(raw, "2026-09-13T23:00:00.000Z");
    expect(result).toContainEqual({ fixtureId: "1001", book: "Bet365", market: "1x2", outcome: "home", decimalOdds: 2.1, ts: "2026-09-13T23:00:00.000Z" });
  });

  it("skips bets with names this program doesn't track rather than guessing", () => {
    const withUnknown = {
      response: [{ fixture: { id: 1 }, bookmakers: [{ id: 1, name: "Bet365", bets: [{ id: 99, name: "Correct Score", values: [{ value: "2:1", odd: "8.0" }] }] }] }],
    };
    expect(normalizeApiFootballOdds(withUnknown)).toEqual([]);
  });

  it("skips outcome values that don't parse to odds > 1", () => {
    const withBad = {
      response: [
        { fixture: { id: 1 }, bookmakers: [{ id: 1, name: "Bet365", bets: [{ id: 1, name: "Match Winner", values: [{ value: "Home", odd: "not-a-number" }] }] }] },
      ],
    };
    expect(normalizeApiFootballOdds(withBad)).toEqual([]);
  });
});
