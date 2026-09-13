import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "./conformance";
import { createBybitDemoAdapter, intentSideToBybitSide } from "../bybitDemo";

/** Live-network conformance runs for real only when BYBIT_DEMO_API_KEY is
 *  present (expected format per bybitDemo.ts's module header:
 *  "<apiKey>:<apiSecret>"). This build environment has no such credential
 *  (docs/alpha/STATUS.md's "Needs Aise" list), so this always skips here
 *  with the reason surfaced in the test name — mirrors manifold.test.ts's
 *  and kalshiDemo.test.ts's structure exactly. */
const rawSecret = process.env.BYBIT_DEMO_API_KEY ?? null;
runConformanceSuite("bybit-demo", () => (rawSecret ? createBybitDemoAdapter(rawSecret) : null), rawSecret ? undefined : { skipReason: "BYBIT_DEMO_API_KEY not set in this environment" });

describe("intentSideToBybitSide", () => {
  it("maps affirmative sides to Buy", () => {
    expect(intentSideToBybitSide("buy")).toBe("Buy");
    expect(intentSideToBybitSide("long")).toBe("Buy");
    expect(intentSideToBybitSide("back")).toBe("Buy");
    expect(intentSideToBybitSide("yes")).toBe("Buy");
  });

  it("maps negative sides to Sell", () => {
    expect(intentSideToBybitSide("sell")).toBe("Sell");
    expect(intentSideToBybitSide("short")).toBe("Sell");
    expect(intentSideToBybitSide("lay")).toBe("Sell");
    expect(intentSideToBybitSide("no")).toBe("Sell");
  });
});
