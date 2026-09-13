import { describe, expect, it } from "vitest";
import { overround, multiplicativeNormalize, shinProbabilities, removeMargin } from "../football/margin";

describe("overround", () => {
  it("is 0 for a perfectly fair book", () => {
    expect(overround([2, 2])).toBeCloseTo(0, 9);
  });

  it("is positive for a real book with margin", () => {
    // 1/1.9 + 1/1.9 = 1.0526... => overround ~5.26%
    expect(overround([1.9, 1.9])).toBeCloseTo(0.0526, 3);
  });

  it("throws for out-of-domain odds", () => {
    expect(() => overround([1, 2])).toThrow();
    expect(() => overround([2])).toThrow();
  });
});

describe("multiplicativeNormalize", () => {
  it("sums to 1", () => {
    const probs = multiplicativeNormalize([1.9, 3.6, 4.2]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("preserves relative proportions of the raw implied probabilities", () => {
    const probs = multiplicativeNormalize([2, 4]); // raw implied: 0.5, 0.25 -> ratio 2:1
    expect(probs[0] / probs[1]).toBeCloseTo(2, 9);
  });

  it("is the identity for already-fair odds", () => {
    const probs = multiplicativeNormalize([4, 4, 2]); // raw implied sum to 1 already
    expect(probs[0]).toBeCloseTo(0.25, 9);
    expect(probs[1]).toBeCloseTo(0.25, 9);
    expect(probs[2]).toBeCloseTo(0.5, 9);
  });
});

describe("shinProbabilities", () => {
  it("sums to 1", () => {
    const probs = shinProbabilities([1.9, 3.6, 4.2]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("matches multiplicative normalization for a fair (zero-margin) book", () => {
    const shin = shinProbabilities([4, 4, 2]);
    const mult = multiplicativeNormalize([4, 4, 2]);
    shin.forEach((p, i) => expect(p).toBeCloseTo(mult[i], 6));
  });

  it("shades probability toward the favorite relative to multiplicative normalization (Shin 1993's documented favorite-longshot correction)", () => {
    // A clear favorite (short odds) vs a clear longshot, with a realistic
    // book margin baked in the same way the fixture generator does it.
    const odds = [1.15, 9.0]; // favorite, longshot
    const shin = shinProbabilities(odds);
    const mult = multiplicativeNormalize(odds);
    expect(shin[0]).toBeGreaterThanOrEqual(mult[0]);
    expect(shin[1]).toBeLessThanOrEqual(mult[1]);
  });

  it("never loops unboundedly and returns a finite result for an extreme book", () => {
    const probs = shinProbabilities([1.01, 1.01, 1.01]); // absurd overround
    expect(probs.every((p) => Number.isFinite(p))).toBe(true);
  });
});

describe("removeMargin", () => {
  it("dispatches to multiplicative by default", () => {
    const odds = [1.9, 3.6, 4.2];
    expect(removeMargin(odds)).toEqual(multiplicativeNormalize(odds));
  });

  it("dispatches to shin when requested", () => {
    const odds = [1.9, 3.6, 4.2];
    expect(removeMargin(odds, "shin")).toEqual(shinProbabilities(odds));
  });
});
