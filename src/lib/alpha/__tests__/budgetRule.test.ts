import { describe, expect, it } from "vitest";
import { reallocate, DEFAULT_MIN_SAMPLES } from "../budgetRule";
import type { StrategySnapshot } from "../budgetRule";

function makeStrategy(overrides: Partial<StrategySnapshot> & { id: string }): StrategySnapshot {
  return {
    currentBudget: 1000,
    budgetFloor: 100,
    nSamples: 0,
    roi: null,
    manuallyPaused: false,
    ...overrides,
  };
}

describe("reallocate", () => {
  it("splits equally when every strategy is under min_samples", () => {
    const strategies = [
      makeStrategy({ id: "a", currentBudget: 1000, nSamples: 5 }),
      makeStrategy({ id: "b", currentBudget: 1000, nSamples: 10 }),
    ];
    const result = reallocate(strategies, 2000);
    const a = result.find((r) => r.id === "a")!;
    const b = result.find((r) => r.id === "b")!;
    expect(a.newBudget).toBeCloseTo(1000, 6);
    expect(b.newBudget).toBeCloseTo(1000, 6);
    expect(a.autoPause).toBe(false);
    expect(b.autoPause).toBe(false);
  });

  it("gives a clear winner a larger share once mature", () => {
    const strategies = [
      makeStrategy({ id: "winner", currentBudget: 1000, nSamples: 100, roi: { mean: 0.1, low: 0.05, high: 0.15 } }),
      makeStrategy({ id: "loser-but-not-confirmed", currentBudget: 1000, budgetFloor: 100, nSamples: 100, roi: { mean: -0.02, low: -0.08, high: 0.02 } }),
    ];
    const result = reallocate(strategies, 2000);
    const winner = result.find((r) => r.id === "winner")!;
    const other = result.find((r) => r.id === "loser-but-not-confirmed")!;
    // winner's weight = 0.05, other's weight = max(0, -0.08) = 0 -> winner takes the whole pool (down to other's floor)
    expect(winner.newBudget).toBeGreaterThan(other.newBudget);
    expect(other.newBudget).toBeGreaterThanOrEqual(100);
  });

  it("auto-pauses a strategy with a negative upper ROI CI bound", () => {
    const strategies = [
      makeStrategy({ id: "confirmed-loser", currentBudget: 1000, budgetFloor: 50, nSamples: 200, roi: { mean: -0.1, low: -0.15, high: -0.03 } }),
      makeStrategy({ id: "control", currentBudget: 1000, nSamples: 200, roi: { mean: 0.01, low: -0.01, high: 0.03 } }),
    ];
    const result = reallocate(strategies, 2000);
    const loser = result.find((r) => r.id === "confirmed-loser")!;
    expect(loser.autoPause).toBe(true);
    expect(loser.newBudget).toBe(50); // pinned to its floor
  });

  it("does not touch a strategy that's already manually paused", () => {
    const strategies = [
      makeStrategy({ id: "manually-paused", currentBudget: 1000, budgetFloor: 25, manuallyPaused: true, roi: { mean: 0.2, low: 0.1, high: 0.3 } }),
      makeStrategy({ id: "active", currentBudget: 1000, nSamples: 100, roi: { mean: 0.05, low: 0.02, high: 0.08 } }),
    ];
    const result = reallocate(strategies, 2000);
    const paused = result.find((r) => r.id === "manually-paused")!;
    expect(paused.autoPause).toBe(false);
    expect(paused.newBudget).toBe(25);
    expect(paused.reason).toContain("already paused");
  });

  it("falls back to an equal split when every mature strategy's lower CI bound is non-positive", () => {
    const strategies = [
      makeStrategy({ id: "a", currentBudget: 1000, nSamples: 100, roi: { mean: 0.01, low: -0.02, high: 0.04 } }),
      makeStrategy({ id: "b", currentBudget: 1000, nSamples: 100, roi: { mean: 0.0, low: -0.03, high: 0.03 } }),
    ];
    const result = reallocate(strategies, 2000);
    expect(result.find((r) => r.id === "a")!.newBudget).toBeCloseTo(1000, 6);
    expect(result.find((r) => r.id === "b")!.newBudget).toBeCloseTo(1000, 6);
  });

  it("never allocates below a strategy's budget floor", () => {
    const strategies = [
      makeStrategy({ id: "dominant", currentBudget: 1900, nSamples: 100, roi: { mean: 0.5, low: 0.4, high: 0.6 } }),
      makeStrategy({ id: "tiny", currentBudget: 100, budgetFloor: 200, nSamples: 100, roi: { mean: -0.4, low: -0.5, high: -0.3 } }),
    ];
    // "tiny" would auto-pause here (negative upper CI) — check its floor is still respected
    const result = reallocate(strategies, 2000);
    expect(result.find((r) => r.id === "tiny")!.newBudget).toBeGreaterThanOrEqual(200);
  });

  it("defaults total budget to the sum of current budgets when not specified", () => {
    const strategies = [makeStrategy({ id: "solo", currentBudget: 750, nSamples: 5 })];
    const result = reallocate(strategies);
    expect(result[0].newBudget).toBeCloseTo(750, 6);
  });

  it("exposes DEFAULT_MIN_SAMPLES matching the spec (50)", () => {
    expect(DEFAULT_MIN_SAMPLES).toBe(50);
  });
});
