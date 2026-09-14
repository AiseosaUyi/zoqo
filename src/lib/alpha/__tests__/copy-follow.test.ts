import { describe, expect, it } from "vitest";
import { sizeCopyIntent, shouldFollowFill, computeSlippageBps, rawFillToSourceRecord, detectPolymarketFills } from "../copy/follow";

describe("sizeCopyIntent (proportional-to-bankroll-fraction, never absolute)", () => {
  it("sizes proportional to the source's fraction of their own bankroll", () => {
    // Source risked 1% of their bankroll -> we risk 1% of our budget.
    const stake = sizeCopyIntent({ sourceFillSizeUsd: 1000, sourceBankrollUsd: 100_000, strategyBudget: 500, maxStake: 100 });
    expect(stake).toBeCloseTo(5, 6); // 1% of 500
  });

  it("caps at maxStake even when the proportional fraction would exceed it", () => {
    const stake = sizeCopyIntent({ sourceFillSizeUsd: 50_000, sourceBankrollUsd: 100_000, strategyBudget: 500, maxStake: 20 });
    expect(stake).toBe(20);
  });

  it("returns 0 for a non-positive bankroll rather than dividing by zero", () => {
    expect(sizeCopyIntent({ sourceFillSizeUsd: 100, sourceBankrollUsd: 0, strategyBudget: 500, maxStake: 100 })).toBe(0);
    expect(sizeCopyIntent({ sourceFillSizeUsd: 100, sourceBankrollUsd: -10, strategyBudget: 500, maxStake: 100 })).toBe(0);
  });
});

describe("shouldFollowFill (pre-follow filters, §3)", () => {
  const base = {
    timeToResolutionMs: 10 * 60 * 60_000,
    minTimeToResolutionMs: 60 * 60_000,
    priceMovedSinceFillPct: 0.02,
    maxPriceMovedPct: 0.08,
    liquidityAtSizeUsd: 500,
    minLiquidityUsd: 50,
    alreadyHoldMarket: false,
  };

  it("follows when every filter passes", () => {
    expect(shouldFollowFill(base)).toEqual({ follow: true });
  });

  it("refuses if we already hold the market", () => {
    expect(shouldFollowFill({ ...base, alreadyHoldMarket: true })).toEqual({ follow: false, reason: "already_hold_market" });
  });

  it("refuses too close to resolution", () => {
    expect(shouldFollowFill({ ...base, timeToResolutionMs: 10_000 })).toEqual({ follow: false, reason: "too_close_to_resolution" });
  });

  it("refuses when the price already moved past the max threshold", () => {
    expect(shouldFollowFill({ ...base, priceMovedSinceFillPct: 0.5 })).toEqual({ follow: false, reason: "price_already_moved" });
  });

  it("refuses when liquidity at our size is below the minimum", () => {
    expect(shouldFollowFill({ ...base, liquidityAtSizeUsd: 10 })).toEqual({ follow: false, reason: "insufficient_liquidity" });
  });
});

describe("computeSlippageBps", () => {
  it("is positive when we paid worse (higher) than the source", () => {
    expect(computeSlippageBps({ sourceFillPrice: 0.5, ourFillPrice: 0.52 })).toBeCloseTo(400, 1);
  });

  it("is negative when we got a better price than the source", () => {
    expect(computeSlippageBps({ sourceFillPrice: 0.5, ourFillPrice: 0.48 })).toBeCloseTo(-400, 1);
  });

  it("returns 0 for a non-positive source price rather than dividing by zero", () => {
    expect(computeSlippageBps({ sourceFillPrice: 0, ourFillPrice: 0.5 })).toBe(0);
  });
});

describe("rawFillToSourceRecord", () => {
  it("maps a raw detected fill into an unresolved SourceFillRecord", () => {
    const record = rawFillToSourceRecord({ venueTradeId: "t1", marketId: "m1", side: "buy", price: 0.6, sizeUsd: 20, filledAtMs: 123 });
    expect(record).toEqual({ filledAt: 123, marketId: "m1", side: "buy", priceAtEntry: 0.6, sizeUsd: 20, resolved: false });
  });
});

/** Live conformance (docs/alpha/PROMPT-alpha-finish.md §6: "Conformance
 *  test against the live Polymarket Data API (no key needed) proving fills
 *  are detected for a real top wallet") — unconditional, not gated behind
 *  an env var, since Polymarket's Data API is genuinely public and keyless
 *  (same precedent as venues/__tests__/polymarketSim.test.ts's own live
 *  conformance run). Uses a real top wallet found live via
 *  https://lb-api.polymarket.com/profit?window=all&limit=1 while building
 *  this test (0x204f7...5e14, "swisstony", $23.6M lifetime profit at the
 *  time) — hardcoded rather than re-fetched per test run so this doesn't
 *  depend on that wallet still being #1 by the time this runs. */
describe("detectPolymarketFills (live conformance — real wallet, real network)", () => {
  it("finds real historical TRADE fills for a real high-volume wallet", async () => {
    const wallet = "0x204f72f35326db932158cba6adff0b9a1da95e14";
    const fills = await detectPolymarketFills(wallet, 0, 20);
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      expect(typeof f.venueTradeId).toBe("string");
      expect(f.venueTradeId.length).toBeGreaterThan(0);
      expect(["buy", "sell"]).toContain(f.side);
      expect(f.price).toBeGreaterThanOrEqual(0);
      expect(f.price).toBeLessThanOrEqual(1);
      expect(f.filledAtMs).toBeGreaterThan(0);
    }
  }, 20000);

  it("returns [] for an obviously invalid wallet address rather than throwing", async () => {
    const fills = await detectPolymarketFills("not-a-real-address", 0, 5);
    expect(fills).toEqual([]);
  }, 20000);
});
