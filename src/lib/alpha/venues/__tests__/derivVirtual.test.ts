import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "./conformance";
import { createDerivVirtualAdapter, intentSideToContractType } from "../derivVirtual";

/** Live conformance runs for real only when DERIV_VIRTUAL_TOKEN (a Deriv
 *  virtual-account API token — Deriv's own terminology, hence not the
 *  generic `${VENUE}_API_KEY` name, see secrets.ts's VENUE_ENV_KEY
 *  override) is present; deliberately conditional (not a permanent skip)
 *  so an environment that DOES export the token gets a real run instead. */
const token = process.env.DERIV_VIRTUAL_TOKEN;
runConformanceSuite(
  "deriv-virtual",
  () => (token ? createDerivVirtualAdapter(token) : null),
  token ? undefined : { skipReason: "DERIV_VIRTUAL_TOKEN not set in this environment (needs a Deriv virtual-account API token)" },
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
