import { describe, expect, it } from "vitest";
import { impliedProbFor, clvForOrder } from "../evaluate";

/** Covers evaluate.ts's per-venue decimal-odds-vs-implied-probability CLV
 *  conversion — exactly the "silent wrong number" class of bug this phase's
 *  brief calls out as worth a dedicated unit test, since a flipped
 *  convention wouldn't throw, it would just quietly make every strategy's
 *  CLV wrong on the leaderboard. */

describe("impliedProbFor", () => {
  it("converts a sportsbook's decimal odds to an implied probability", () => {
    expect(impliedProbFor("zoqo-sportsbook", 2)).toBeCloseTo(0.5, 10);
    expect(impliedProbFor("zoqo-sportsbook", 4)).toBeCloseTo(0.25, 10);
  });

  it("passes through venues that already store an implied probability", () => {
    expect(impliedProbFor("manifold", 0.62)).toBeCloseTo(0.62, 10);
    expect(impliedProbFor("kalshi-demo", 0.5)).toBeCloseTo(0.5, 10);
    expect(impliedProbFor("polymarket-sim", 0.1)).toBeCloseTo(0.1, 10);
  });

  it("returns null for price venues that aren't odds/a probability at all", () => {
    expect(impliedProbFor("zoqo-terminal", 65000)).toBeNull();
    expect(impliedProbFor("bybit-demo", 3.2)).toBeNull();
    expect(impliedProbFor("deriv-virtual", 4.5)).toBeNull();
  });

  it("returns null for a non-positive price/odds", () => {
    expect(impliedProbFor("zoqo-sportsbook", 0)).toBeNull();
    expect(impliedProbFor("manifold", -1)).toBeNull();
  });
});

describe("clvForOrder", () => {
  it("computes positive CLV for a sportsbook bet that beat the closing line (shorter closing odds)", () => {
    // Taken at 4.0 (25% implied), closed at 3.0 (33.3% implied) — the market
    // moved TOWARD the bettor's side, i.e. they got a better price than the
    // closing line implies they should have. closingImplied/takenImplied - 1
    // = 0.3333/0.25 - 1 = 0.333... > 0.
    const result = clvForOrder("zoqo-sportsbook", 4.0, 3.0);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  it("computes negative CLV for a sportsbook bet that drifted against the bettor", () => {
    // Taken at 2.0 (50% implied), closed at 4.0 (25% implied) — the market
    // drifted the other way; the bettor took a worse price than closing.
    const result = clvForOrder("zoqo-sportsbook", 2.0, 4.0);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });

  it("works directly on an already-implied-probability venue with no conversion", () => {
    // Manifold: taken at 40% probability, closed at 50% — the market moved
    // toward "yes" after the bettor bought yes at a cheaper price. Positive CLV.
    const result = clvForOrder("manifold", 0.4, 0.5);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.5 / 0.4 - 1, 10);
  });

  it("returns null when the closing price is missing (void orders, no snapshot)", () => {
    expect(clvForOrder("zoqo-sportsbook", 2.5, null)).toBeNull();
    expect(clvForOrder("zoqo-sportsbook", 2.5, undefined)).toBeNull();
  });

  it("returns null for a price venue where neither price is a probability", () => {
    expect(clvForOrder("zoqo-terminal", 65000, 66000)).toBeNull();
    expect(clvForOrder("bybit-demo", 3.2, 3.5)).toBeNull();
  });
});
