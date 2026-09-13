import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "./conformance";
import { createDerivVirtualAdapter, intentSideToContractType } from "../derivVirtual";

/** Live conformance runs for real only when DERIV_VIRTUAL_API_KEY (a
 *  Deriv virtual-account token) is present; this build environment has no
 *  such token (docs/alpha/STATUS.md's "Needs Aise" list), so this always
 *  skips here with the reason surfaced in the test name — per the repo's
 *  standing rule, that's the correct outcome to record, not a gap to work
 *  around. Deliberately conditional (not a permanent skip) so a future
 *  environment that DOES export the token gets a real run instead. */
const token = process.env.DERIV_VIRTUAL_API_KEY;
runConformanceSuite(
  "deriv-virtual",
  () => (token ? createDerivVirtualAdapter(token) : null),
  token ? undefined : { skipReason: "DERIV_VIRTUAL_API_KEY not set in this environment (needs a Deriv virtual-account token)" },
);

describe("intentSideToContractType", () => {
  it("maps affirmative sides to CALL (rise)", () => {
    expect(intentSideToContractType("buy")).toBe("CALL");
    expect(intentSideToContractType("long")).toBe("CALL");
    expect(intentSideToContractType("back")).toBe("CALL");
    expect(intentSideToContractType("yes")).toBe("CALL");
  });

  it("maps negative sides to PUT (fall)", () => {
    expect(intentSideToContractType("sell")).toBe("PUT");
    expect(intentSideToContractType("short")).toBe("PUT");
    expect(intentSideToContractType("lay")).toBe("PUT");
    expect(intentSideToContractType("no")).toBe("PUT");
  });
});

describe("createDerivVirtualAdapter degradation (no global WebSocket / no token)", () => {
  // This suite's node environment (vitest.config.ts) has no global
  // WebSocket, and even with one, no token is passed here — both are
  // exactly the "socket unavailable" conditions derivRequest() must
  // degrade cleanly from, per this module's header. These assertions hold
  // regardless of which of the two reasons applies in a given runtime.
  it("place() rejects cleanly instead of hanging or throwing", async () => {
    const adapter = createDerivVirtualAdapter(null);
    const order = await adapter.place(
      { strategyId: "s", market: { venue: "deriv-virtual", marketId: "R_75" }, side: "long", kind: "market", edge: 0.1, rationale: "test" },
      10,
      { userId: "u", now: Date.now() },
    );
    expect(order.status).toBe("rejected");
  });

  it("balance() returns a zeroed shape with no token", async () => {
    const adapter = createDerivVirtualAdapter(null);
    const balance = await adapter.balance();
    expect(balance).toEqual({ cash: 0, currency: "USD" });
  });

  it("getQuote()/listMarkets()/settle() degrade to null/[]/[] rather than throwing", async () => {
    const adapter = createDerivVirtualAdapter(null);
    await expect(adapter.getQuote({ venue: "deriv-virtual", marketId: "R_75" })).resolves.toBeNull();
    await expect(adapter.listMarkets({ limit: 5 })).resolves.toEqual([]);
    await expect(
      adapter.settle([
        {
          venueOrderId: "12345",
          market: { venue: "deriv-virtual", marketId: "R_75" },
          side: "long",
          stake: 10,
          currency: "USD",
          priceOrOdds: 5,
          placedAt: Date.now(),
          status: "filled",
        },
      ]),
    ).resolves.toEqual([]);
  });
});
