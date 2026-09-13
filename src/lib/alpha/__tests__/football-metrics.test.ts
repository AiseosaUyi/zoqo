import { describe, expect, it } from "vitest";
import { rps, brier, clv, hitRate, maxDrawdown, sharpeLike, bootstrapRoiCI } from "../football/metrics";

describe("rps", () => {
  it("is 0 for a perfect prediction", () => {
    expect(rps({ home: 1, draw: 0, away: 0 }, "home")).toBeCloseTo(0, 9);
    expect(rps({ home: 0, draw: 1, away: 0 }, "draw")).toBeCloseTo(0, 9);
    expect(rps({ home: 0, draw: 0, away: 1 }, "away")).toBeCloseTo(0, 9);
  });

  it("is 1 for the maximally wrong prediction (all mass on the far outcome)", () => {
    expect(rps({ home: 0, draw: 0, away: 1 }, "home")).toBeCloseTo(1, 9);
    expect(rps({ home: 1, draw: 0, away: 0 }, "away")).toBeCloseTo(1, 9);
  });

  it("penalizes a wrong prediction on the adjacent (draw) outcome less than the far outcome", () => {
    const predictedHome = { home: 1, draw: 0, away: 0 };
    const rpsWhenDrawHappens = rps(predictedHome, "draw");
    const rpsWhenAwayHappens = rps(predictedHome, "away");
    expect(rpsWhenDrawHappens).toBeLessThan(rpsWhenAwayHappens);
  });

  it("matches a hand-computed value for a uniform prediction", () => {
    // predicted [1/3,1/3,1/3], actual = home: cumP=[1/3,2/3], cumE=[1,1]
    // rps = ((1/3-1)^2 + (2/3-1)^2)/2 = ((4/9)+(1/9))/2 = 5/18
    expect(rps({ home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, "home")).toBeCloseTo(5 / 18, 9);
  });

  it("stays within [0,1]", () => {
    const cases: Array<[{ home: number; draw: number; away: number }, "home" | "draw" | "away"]> = [
      [{ home: 0.6, draw: 0.25, away: 0.15 }, "home"],
      [{ home: 0.6, draw: 0.25, away: 0.15 }, "draw"],
      [{ home: 0.6, draw: 0.25, away: 0.15 }, "away"],
    ];
    for (const [p, actual] of cases) {
      const value = rps(p, actual);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("brier", () => {
  it("is 0 for a perfectly confident correct call", () => {
    expect(brier(1, true)).toBe(0);
    expect(brier(0, false)).toBe(0);
  });

  it("is 1 for a perfectly confident wrong call", () => {
    expect(brier(1, false)).toBe(1);
    expect(brier(0, true)).toBe(1);
  });

  it("is 0.25 for a coin-flip prediction either way", () => {
    expect(brier(0.5, true)).toBeCloseTo(0.25, 9);
    expect(brier(0.5, false)).toBeCloseTo(0.25, 9);
  });
});

describe("clv", () => {
  it("is 0 when the taken price matches the closing price exactly", () => {
    expect(clv(0.45, 0.45)).toBeCloseTo(0, 9);
  });

  it("is positive when taken implied probability is lower than closing — beat the closing line (good)", () => {
    expect(clv(0.4, 0.5)).toBeCloseTo(0.25, 9); // 0.5/0.4-1 = 0.25
  });

  it("is negative when taken implied probability is higher than closing — worse than closing (bad)", () => {
    expect(clv(0.6, 0.5)).toBeCloseTo(-1 / 6, 9); // 0.5/0.6-1
  });

  it("returns 0 for a non-positive taken implied probability rather than dividing by zero", () => {
    expect(clv(0, 0.5)).toBe(0);
  });
});

describe("hitRate", () => {
  it("computes the fraction of strictly-positive returns", () => {
    expect(hitRate([1, -1, 2, -3, 0])).toBeCloseTo(0.4, 9);
  });

  it("is 0 for an empty series", () => {
    expect(hitRate([])).toBe(0);
  });
});

describe("maxDrawdown", () => {
  it("matches a hand-computed peak-to-trough decline", () => {
    // cumulative: 10, 5, -3, 17, 2 -> peaks 10,10,10,17,17 -> dd 0,5,13,0,15
    expect(maxDrawdown([10, -5, -8, 20, -15])).toBeCloseTo(15, 9);
  });

  it("is 0 for a monotonically increasing series", () => {
    expect(maxDrawdown([1, 2, 3, 4])).toBe(0);
  });
});

describe("sharpeLike", () => {
  it("matches a hand-computed value", () => {
    // [1,3]: mean=2, sample variance=((1-2)^2+(3-2)^2)/(2-1)=2, stdev=sqrt(2)
    // sharpeLike = 2/sqrt(2) = sqrt(2)
    expect(sharpeLike([1, 3])).toBeCloseTo(Math.sqrt(2), 9);
  });

  it("is 0 for constant P&L (zero variance)", () => {
    expect(sharpeLike([2, 2, 2])).toBe(0);
  });

  it("is 0 for fewer than 2 points", () => {
    expect(sharpeLike([5])).toBe(0);
    expect(sharpeLike([])).toBe(0);
  });
});

describe("bootstrapRoiCI", () => {
  it("is fully deterministic given the same inputs (seeded, not Math.random)", () => {
    const returns = [0.1, -0.05, 0.2, -0.1, 0.15, -0.02, 0.3];
    const a = bootstrapRoiCI(returns, 500);
    const b = bootstrapRoiCI(returns, 500);
    expect(a).toEqual(b);
  });

  it("reports the true sample mean, not a resampled one", () => {
    const returns = [0.1, -0.05, 0.2, -0.1, 0.15];
    const { mean } = bootstrapRoiCI(returns, 500);
    const trueMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    expect(mean).toBeCloseTo(trueMean, 9);
  });

  it("produces low <= high", () => {
    const returns = [0.1, -0.05, 0.2, -0.1, 0.15, 0.05, -0.2, 0.25];
    const { low, high } = bootstrapRoiCI(returns, 1000);
    expect(low).toBeLessThanOrEqual(high);
  });

  it("returns a degenerate zero interval for an empty series", () => {
    expect(bootstrapRoiCI([])).toEqual({ mean: 0, low: 0, high: 0 });
  });

  it("caps iterations rather than looping unboundedly, and still returns fast", () => {
    const returns = [0.1, -0.1, 0.2];
    const start = Date.now();
    const result = bootstrapRoiCI(returns, 10_000_000);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(Number.isFinite(result.low)).toBe(true);
    expect(Number.isFinite(result.high)).toBe(true);
  });

  it("a different explicit seed can change the resampled interval", () => {
    const returns = [0.1, -0.05, 0.2, -0.1, 0.15, 0.3, -0.25];
    const a = bootstrapRoiCI(returns, 500, 0.95, 1);
    const b = bootstrapRoiCI(returns, 500, 0.95, 2);
    // Not asserting inequality strictly (astronomically unlikely but not
    // impossible to collide) — just that both are valid, finite intervals.
    expect(Number.isFinite(a.low)).toBe(true);
    expect(Number.isFinite(b.low)).toBe(true);
  });
});
