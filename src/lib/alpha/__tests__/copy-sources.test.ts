import { describe, expect, it } from "vitest";
import { scoreSource, updateStability, weekStartOf, type SourceFillRecord } from "../copy/sources";

const DAY = 86_400_000;

function fixtureFill(overrides: Partial<SourceFillRecord> = {}): SourceFillRecord {
  return { filledAt: Date.now(), marketId: "m1", side: "buy", priceAtEntry: 0.6, sizeUsd: 50, resolved: true, won: true, pnl: 30, ...overrides };
}

/** Synthetic fixture of source fills (docs/alpha/PROMPT-alpha-finish.md §6's
 *  "Vitest for the screen scoring... on a fixture of synthetic source
 *  fills") — a source with a real, above-chance track record: 150 resolved
 *  wins, 50 resolved losses, spread across 100 days and 10 markets. */
function makeSkillfulSourceFills(now: number): SourceFillRecord[] {
  const fills: SourceFillRecord[] = [];
  for (let i = 0; i < 200; i++) {
    const won = i % 4 !== 0; // 150 wins, 50 losses — 75% hit rate
    fills.push({
      filledAt: now - (100 - (i % 100)) * DAY,
      marketId: `market-${i % 10}`,
      side: "buy",
      priceAtEntry: 0.55,
      sizeUsd: 100,
      resolved: true,
      won,
      pnl: won ? 80 : -100,
    });
  }
  return fills;
}

describe("scoreSource", () => {
  it("meetsMinimumHistory is false under 200 fills, under 90 days active, or stale (>14 days since last fill)", () => {
    const now = Date.now();
    expect(scoreSource(Array.from({ length: 50 }, () => fixtureFill({ filledAt: now })), { now }).meetsMinimumHistory).toBe(false);

    const shortWindow = Array.from({ length: 250 }, (_, i) => fixtureFill({ filledAt: now - i * 1000 })); // 250 fills, ~4 min span
    expect(scoreSource(shortWindow, { now }).meetsMinimumHistory).toBe(false);

    const stale = makeSkillfulSourceFills(now - 30 * DAY); // last fill 30 days before "now"
    expect(scoreSource(stale, { now }).meetsMinimumHistory).toBe(false);
  });

  it("a real, skillful, active track record clears the minimum-history gate and scores meaningfully above zero", () => {
    const now = Date.now();
    const result = scoreSource(makeSkillfulSourceFills(now), { now });
    expect(result.meetsMinimumHistory).toBe(true);
    expect(result.metrics.n).toBe(200);
    expect(result.metrics.resolvedN).toBe(200);
    expect(result.metrics.brier).not.toBeNull();
    expect(result.metrics.brier!).toBeLessThan(0.25); // better than a coin-flip Brier score
    expect(result.metrics.profitFactor).not.toBeNull();
    expect(result.metrics.profitFactor!).toBeGreaterThan(1); // net profitable
    expect(result.score).toBeGreaterThan(0.3);
  });

  it("a source with a losing record scores lower than a skillful one on the same volume", () => {
    const now = Date.now();
    const skillful = scoreSource(makeSkillfulSourceFills(now), { now });
    const losing = makeSkillfulSourceFills(now).map((f) => ({ ...f, won: !f.won, pnl: f.pnl! > 0 ? -f.pnl! : Math.abs(f.pnl!) }));
    const losingResult = scoreSource(losing, { now });
    expect(losingResult.score).toBeLessThan(skillful.score);
  });

  it("concentration in one market is penalized even with a good hit rate", () => {
    const now = Date.now();
    const concentrated = makeSkillfulSourceFills(now).map((f) => ({ ...f, marketId: "only-market" }));
    const diversified = makeSkillfulSourceFills(now);
    const concentratedResult = scoreSource(concentrated, { now });
    const diversifiedResult = scoreSource(diversified, { now });
    expect(concentratedResult.metrics.marketConcentration).toBe(1);
    expect(concentratedResult.score).toBeLessThan(diversifiedResult.score);
  });

  it("copyability drops as median trade size approaches the assumed typical depth", () => {
    const now = Date.now();
    const smallSize = scoreSource(makeSkillfulSourceFills(now).map((f) => ({ ...f, sizeUsd: 10 })), { now, typicalDepthUsd: 5000 });
    const wholeSize = scoreSource(makeSkillfulSourceFills(now).map((f) => ({ ...f, sizeUsd: 5000 })), { now, typicalDepthUsd: 5000 });
    expect(smallSize.metrics.copyability).toBeGreaterThan(wholeSize.metrics.copyability);
  });
});

describe("updateStability (two-consecutive-weeks-above-threshold rule)", () => {
  it("is not followable on the first qualifying week", () => {
    const { followable } = updateStability(null, "2026-09-07", 0.7, 0.55);
    expect(followable).toBe(false);
  });

  it("becomes followable after two consecutive weeks at or above threshold", () => {
    const week1 = updateStability(null, "2026-09-01", 0.7, 0.55);
    const week2 = updateStability(week1.state, "2026-09-08", 0.65, 0.55);
    expect(week2.followable).toBe(true);
  });

  it("is not followable if the most recent week drops below threshold, even after a prior good week", () => {
    const week1 = updateStability(null, "2026-09-01", 0.7, 0.55);
    const week2 = updateStability(week1.state, "2026-09-08", 0.4, 0.55);
    expect(week2.followable).toBe(false);
  });

  it("re-writing the same week updates it in place rather than duplicating", () => {
    const first = updateStability(null, "2026-09-01", 0.6, 0.55);
    const corrected = updateStability(first.state, "2026-09-01", 0.9, 0.55);
    expect(corrected.state.scoreHistory).toHaveLength(1);
    expect(corrected.state.scoreHistory[0].score).toBe(0.9);
  });
});

describe("weekStartOf", () => {
  it("returns the Monday (UTC) of the containing week", () => {
    // 2026-09-14 is a Monday.
    expect(weekStartOf(new Date("2026-09-14T12:00:00Z").getTime())).toBe("2026-09-14");
    expect(weekStartOf(new Date("2026-09-17T23:00:00Z").getTime())).toBe("2026-09-14"); // Thursday same week
    expect(weekStartOf(new Date("2026-09-20T00:00:00Z").getTime())).toBe("2026-09-14"); // Sunday same week
    expect(weekStartOf(new Date("2026-09-21T00:00:00Z").getTime())).toBe("2026-09-21"); // next Monday
  });
});
