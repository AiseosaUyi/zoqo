import { describe, expect, it } from "vitest";
import { kellyFraction, kellyFractionFromEdge } from "../kelly";

describe("kellyFraction", () => {
  it("returns 0 with no edge (fair odds)", () => {
    // decimalOdds=2 implies a 50% break-even probability; modelProb=0.5 is fair.
    expect(kellyFraction(0.5, 2, 0.25)).toBe(0);
  });

  it("returns a positive fraction with a real edge", () => {
    // modelProb=0.6 at decimalOdds=2 (fair=0.5): full Kelly = (1*0.6-0.4)/1 = 0.2, *0.25 = 0.05
    expect(kellyFraction(0.6, 2, 0.25)).toBeCloseTo(0.05, 6);
  });

  it("scales linearly with the fraction parameter", () => {
    const full = kellyFraction(0.6, 2, 1);
    expect(kellyFraction(0.6, 2, 0.5)).toBeCloseTo(full * 0.5, 6);
  });

  it("returns 0 for a negative-edge bet rather than a negative stake", () => {
    // modelProb=0.4 at decimalOdds=2 (fair=0.5) is a losing proposition.
    expect(kellyFraction(0.4, 2, 0.25)).toBe(0);
  });

  it("returns 0 for out-of-domain inputs", () => {
    expect(kellyFraction(0.6, 1, 0.25)).toBe(0); // decimalOdds must be > 1
    expect(kellyFraction(0, 2, 0.25)).toBe(0);
    expect(kellyFraction(1, 2, 0.25)).toBe(0);
    expect(kellyFraction(0.6, 2, 0)).toBe(0);
  });

  it("never exceeds the fraction parameter itself (full Kelly capped at 1)", () => {
    expect(kellyFraction(0.99, 100, 1)).toBeLessThanOrEqual(1);
  });
});

describe("kellyFractionFromEdge", () => {
  it("matches kellyFraction via the implied-odds conversion", () => {
    // marketProb=0.5 -> impliedDecimalOdds=2; edge=0.1 -> modelProb=0.6.
    expect(kellyFractionFromEdge(0.1, 0.5, 0.25)).toBeCloseTo(kellyFraction(0.6, 2, 0.25), 6);
  });

  it("returns 0 for a non-positive or reversed edge", () => {
    expect(kellyFractionFromEdge(0, 0.5, 0.25)).toBe(0);
    expect(kellyFractionFromEdge(-0.1, 0.5, 0.25)).toBe(0);
  });

  it("returns 0 for out-of-domain market probabilities", () => {
    expect(kellyFractionFromEdge(0.1, 0, 0.25)).toBe(0);
    expect(kellyFractionFromEdge(0.1, 1, 0.25)).toBe(0);
  });
});
