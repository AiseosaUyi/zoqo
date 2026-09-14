import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "./conformance";
import { createKalshiDemoAdapter, estimateSettlementPnl, intentSideToKalshiSide } from "../kalshiDemo";

/** Live-network conformance runs for real only when KALSHI_DEMO_API_KEY is
 *  present (expected format per kalshiDemo.ts's module header:
 *  "<accessKeyId>:<privateKeyPem>", newlines escaped as literal `\n`).
 *  Without `.env.local` loaded (this repo's standard `npm run test:unit`
 *  doesn't load it), this always skips here with the reason surfaced in
 *  the test name — per the repo's standing rule. Mirrors manifold.test.ts's
 *  structure exactly.
 *
 *  Caveat worth knowing: `balance returns a {cash, currency} shape` below
 *  only checks the *shape*, not that the RSA-PSS request actually
 *  authenticated — a silently-swallowed 401 also returns `{cash: 0,
 *  currency: "USD"}` (see `kalshiDemo.ts`'s `balance()`), so this test
 *  alone can't tell "real zero balance" from "signature rejected" apart.
 *  That gap is exactly how a real bug (the signed string was missing the
 *  `/trade-api/v2` prefix Kalshi's docs require — see `signRequest`'s
 *  header in kalshiDemo.ts) went unnoticed until a real credential existed
 *  to test against. Verified live 2026-09-14 with a one-off fetch-status
 *  probe (not committed — the fix plus this credential's real 200 response
 *  is the lasting proof): a genuine `HTTP 200` from `/portfolio/balance`
 *  with a real (zero, fresh-account) balance payload, confirming the
 *  signing fix and this credential both work, not just that nothing
 *  threw. */
const rawSecret = process.env.KALSHI_DEMO_API_KEY ?? null;
runConformanceSuite("kalshi-demo", () => (rawSecret ? createKalshiDemoAdapter(rawSecret) : null), rawSecret ? undefined : { skipReason: "KALSHI_DEMO_API_KEY not set in this environment" });

describe("intentSideToKalshiSide", () => {
  it("maps affirmative sides to yes", () => {
    expect(intentSideToKalshiSide("buy")).toBe("yes");
    expect(intentSideToKalshiSide("long")).toBe("yes");
    expect(intentSideToKalshiSide("back")).toBe("yes");
    expect(intentSideToKalshiSide("yes")).toBe("yes");
  });

  it("maps negative sides to no", () => {
    expect(intentSideToKalshiSide("sell")).toBe("no");
    expect(intentSideToKalshiSide("short")).toBe("no");
    expect(intentSideToKalshiSide("lay")).toBe("no");
    expect(intentSideToKalshiSide("no")).toBe("no");
  });
});

describe("estimateSettlementPnl", () => {
  it("returns 0 when the market has no result (void/undetermined)", () => {
    expect(estimateSettlementPnl({ side: "yes", stake: 50, priceOrOddsAtEntry: 0.3, result: "" })).toBe(0);
  });

  it("pays approx contracts*$1 - stake on a correct yes resolution", () => {
    // entry price 0.5 -> contracts = 10/0.5 = 20; payout 20; pnl 10
    const pnl = estimateSettlementPnl({ side: "yes", stake: 10, priceOrOddsAtEntry: 0.5, result: "yes" });
    expect(pnl).toBeCloseTo(10, 6);
  });

  it("loses the full stake on an incorrect resolution", () => {
    const pnl = estimateSettlementPnl({ side: "yes", stake: 10, priceOrOddsAtEntry: 0.5, result: "no" });
    expect(pnl).toBe(-10);
  });

  it("a cheap correct longshot bet pays out proportionally more", () => {
    // entry price 0.2 for the no side -> contracts = 10/0.2 = 50; payout 50; pnl 40
    const pnl = estimateSettlementPnl({ side: "no", stake: 10, priceOrOddsAtEntry: 0.2, result: "no" });
    expect(pnl).toBeCloseTo(40, 6);
  });

  it("clamps a degenerate entry price instead of dividing by zero", () => {
    const pnl = estimateSettlementPnl({ side: "yes", stake: 10, priceOrOddsAtEntry: 0, result: "yes" });
    expect(Number.isFinite(pnl)).toBe(true);
  });
});
