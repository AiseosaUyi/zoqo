import { describe, expect, it } from "vitest";
import { cartesianProduct, scoreCandidate, type LoggedDecisionOutcome } from "../paramSearch";

describe("cartesianProduct", () => {
  it("returns one empty candidate for an empty paramSpace", () => {
    expect(cartesianProduct({})).toEqual([{}]);
  });

  it("builds the full cross-product for a single key", () => {
    const combos = cartesianProduct({ minReturnAbs: [0.001, 0.002, 0.003] });
    expect(combos).toEqual([{ minReturnAbs: 0.001 }, { minReturnAbs: 0.002 }, { minReturnAbs: 0.003 }]);
  });

  it("builds the full cross-product across multiple keys", () => {
    const combos = cartesianProduct({ a: [1, 2], b: [10, 20] });
    expect(combos).toHaveLength(4);
    expect(combos).toEqual(
      expect.arrayContaining([
        { a: 1, b: 10 },
        { a: 1, b: 20 },
        { a: 2, b: 10 },
        { a: 2, b: 20 },
      ]),
    );
  });

  it("caps the search at MAX_COMBINATIONS (200) rather than exploding unbounded", () => {
    const combos = cartesianProduct({ a: Array.from({ length: 20 }, (_, i) => i), b: Array.from({ length: 20 }, (_, i) => i) });
    // 20*20 = 400 raw combinations — must be capped, not returned in full.
    expect(combos.length).toBeLessThanOrEqual(200);
    expect(combos.length).toBeGreaterThan(0);
  });
});

describe("scoreCandidate", () => {
  const dataset: LoggedDecisionOutcome[] = [
    { features: { return4h: 0.001 }, pnl: -10, stake: 100 }, // tiny move, a stricter min filter should drop this
    { features: { return4h: 0.004 }, pnl: 30, stake: 100 },
    { features: { return4h: -0.005 }, pnl: 40, stake: 100 },
    { features: { return4h: 0.0015 }, pnl: -5, stake: 100 },
  ];
  // Mirrors terminalHourlyMomentum.ts's real `paramFeatureKeys`: the param
  // is named `minReturnAbs` but the logged feature is `return4h` — a
  // different name, exactly the case this mapping exists for.
  const featureKeyMap = { minReturnAbs: "return4h", maxReturnAbs: "return4h" };

  it("scores the unfiltered baseline (empty candidate) using every decision", () => {
    const result = scoreCandidate(dataset, {});
    expect(result.n).toBe(4);
    expect(result.totalStake).toBe(400);
    expect(result.roi).toBeCloseTo((-10 + 30 + 40 - 5) / 400, 10);
  });

  it("filters out decisions below a min* threshold via the param-to-feature mapping", () => {
    // Only |return4h| >= 0.002 survive: 0.004 and -0.005 → pnl 30 + 40 = 70 / 200 stake.
    const result = scoreCandidate(dataset, { minReturnAbs: 0.002 }, featureKeyMap);
    expect(result.n).toBe(2);
    expect(result.totalStake).toBe(200);
    expect(result.roi).toBeCloseTo(70 / 200, 10);
  });

  it("falls back to matching a same-named feature when no mapping entry exists", () => {
    // No featureKeyMap passed — "minReturn4h" (deliberately named to match
    // the feature literally) should still filter correctly via the default
    // same-name fallback.
    const sameNamedDataset: LoggedDecisionOutcome[] = [
      { features: { minReturn4h: 0.001 }, pnl: -10, stake: 100 },
      { features: { minReturn4h: 0.004 }, pnl: 30, stake: 100 },
    ];
    const result = scoreCandidate(sameNamedDataset, { minReturn4h: 0.002 });
    expect(result.n).toBe(1);
    expect(result.roi).toBeCloseTo(30 / 100, 10);
  });

  it("keeps a decision when the candidate key has no mapped or same-named logged feature", () => {
    // "minFooBar" has no analogous feature on any decision — every decision
    // survives (can't judge what wasn't logged), matching the documented
    // "no honest way to re-score this — keep it" behavior.
    const result = scoreCandidate(dataset, { minFooBar: 999 }, featureKeyMap);
    expect(result.n).toBe(4);
  });

  it("ignores a candidate key that isn't min*/max*-shaped (can't be re-scored from a point-in-time feature)", () => {
    const result = scoreCandidate(dataset, { fastMin: 5 }, featureKeyMap);
    expect(result.n).toBe(4); // no filtering applied at all for this key
  });

  it("applies a max* threshold as a ceiling on the feature's magnitude", () => {
    // Only |return4h| <= 0.0015 survive: 0.001 and 0.0015 → pnl -10 + -5 = -15 / 200.
    const result = scoreCandidate(dataset, { maxReturnAbs: 0.0015 }, featureKeyMap);
    expect(result.n).toBe(2);
    expect(result.roi).toBeCloseTo(-15 / 200, 10);
  });

  it("returns roi 0 when no decisions survive (zero stake, avoids division by zero)", () => {
    const result = scoreCandidate(dataset, { minReturnAbs: 999 }, featureKeyMap);
    expect(result.n).toBe(0);
    expect(result.roi).toBe(0);
  });
});
