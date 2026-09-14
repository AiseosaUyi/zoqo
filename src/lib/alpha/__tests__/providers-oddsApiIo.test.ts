import { describe, expect, it } from "vitest";
import { fetchOddsSnapshots, normalizeOddsEnvelope } from "../providers/oddsApiIo";

describe("oddsApiIo (INACTIVE — odds-api.io's free tier is paused indefinitely, docs/alpha/PROMPT-alpha-finish.md §4)", () => {
  it("fetchOddsSnapshots always throws — replaced by bet9jaPublic.ts/nairabetPublic.ts/apiFootballOdds.ts", async () => {
    await expect(fetchOddsSnapshots(null, undefined as never, {})).rejects.toThrow(/inactive/);
  });
});

describe("normalizeOddsEnvelope (pure mapping — see oddsApiIo.ts's ENDPOINT SHAPE ASSUMPTION)", () => {
  it("maps a well-formed envelope into normalized snapshots", () => {
    const raw = {
      data: [
        {
          fixtureId: "f1",
          bookmakers: [
            {
              key: "bet9ja",
              lastUpdate: "2026-09-13T10:00:00.000Z",
              markets: [
                { key: "1x2", outcomes: [{ name: "home", price: 2.1 }, { name: "draw", price: 3.2 }, { name: "away", price: 3.5 }] },
                { key: "ou25", outcomes: [{ name: "over", price: 1.9 }, { name: "under", price: 1.95 }] },
              ],
            },
          ],
        },
      ],
    };
    const result = normalizeOddsEnvelope(raw, "2026-09-13T10:00:00.000Z");
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ fixtureId: "f1", book: "bet9ja", market: "1x2", outcome: "home", decimalOdds: 2.1, ts: "2026-09-13T10:00:00.000Z" });
  });

  it("skips unrecognized markets and outcomes rather than guessing", () => {
    const raw = {
      data: [
        {
          fixtureId: "f1",
          bookmakers: [
            {
              key: "sportybet",
              markets: [{ key: "outrights", outcomes: [{ name: "team-x", price: 5.0 }] }],
            },
          ],
        },
      ],
    };
    expect(normalizeOddsEnvelope(raw)).toEqual([]);
  });

  it("skips outcomes with non-positive or invalid odds", () => {
    const raw = {
      data: [
        {
          fixtureId: "f1",
          bookmakers: [{ key: "bet9ja", markets: [{ key: "1x2", outcomes: [{ name: "home", price: 0 }, { name: "draw", price: NaN }] }] }],
        },
      ],
    };
    expect(normalizeOddsEnvelope(raw)).toEqual([]);
  });

  it("maps double-chance aliases (1x/x2/12) to hd/da/ha", () => {
    const raw = {
      data: [
        {
          fixtureId: "f1",
          bookmakers: [{ key: "bet9ja", markets: [{ key: "double_chance", outcomes: [{ name: "1x", price: 1.3 }, { name: "x2", price: 1.4 }, { name: "12", price: 1.1 }] }] }],
        },
      ],
    };
    const result = normalizeOddsEnvelope(raw);
    expect(result.map((r) => r.outcome).sort()).toEqual(["da", "ha", "hd"]);
    expect(result.every((r) => r.market === "dc")).toBe(true);
  });
});
