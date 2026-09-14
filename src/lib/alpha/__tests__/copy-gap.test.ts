import { describe, expect, it } from "vitest";
import { computeCopyGap } from "../copy/gap";

describe("computeCopyGap", () => {
  it("averages return/CLV only across settled (non-null) outcomes", () => {
    const result = computeCopyGap([
      { lagMs: 1000, ourReturn: 0.1, ourClv: 0.02 },
      { lagMs: 2000, ourReturn: -0.05, ourClv: -0.01 },
      { lagMs: 3000, ourReturn: null, ourClv: null }, // not yet settled — excluded, not treated as 0
    ]);
    expect(result.n).toBe(3);
    expect(result.ourReturn).toBeCloseTo(0.025, 6); // (0.1 - 0.05) / 2
    expect(result.ourClv).toBeCloseTo(0.005, 6);
  });

  it("computes the lag distribution (p50/min/max) ignoring null lags", () => {
    const result = computeCopyGap([
      { lagMs: 500, ourReturn: null, ourClv: null },
      { lagMs: 1500, ourReturn: null, ourClv: null },
      { lagMs: null, ourReturn: null, ourClv: null },
      { lagMs: 3000, ourReturn: null, ourClv: null },
    ]);
    expect(result.lagMsMin).toBe(500);
    expect(result.lagMsMax).toBe(3000);
    expect(result.lagMsP50).toBe(1500);
  });

  it("returns nulls (not zeros or NaN) for an empty or all-unsettled set", () => {
    expect(computeCopyGap([])).toEqual({ n: 0, ourReturn: null, ourClv: null, lagMsP50: null, lagMsMin: null, lagMsMax: null });
    expect(computeCopyGap([{ lagMs: null, ourReturn: null, ourClv: null }]).ourReturn).toBeNull();
  });
});
