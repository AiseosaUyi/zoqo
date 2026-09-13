import { describe, expect, it } from "vitest";
import type { VenueAdapter } from "../../core/venue";

/** Shared structural conformance suite every VenueAdapter's own test file
 *  imports and calls — Phase 2's Manifold adapter is the first user, but
 *  this is written generic over VenueAdapter (no Manifold-specific
 *  assumptions) so Phase 4's Kalshi/Bybit/Deriv/Polymarket adapters reuse
 *  it unchanged, per phase-2-manifold.md's scope note.
 *
 *  This is NOT a correctness suite for any one venue's business logic
 *  (that's each adapter's own `*.test.ts`, e.g. manifold.test.ts's pure
 *  pnl-mapping tests) — it only checks the shapes every adapter promises
 *  the runner/risk-gate it will return.
 *
 *  Per the repo's standing rule, a venue with no live credentials in this
 *  environment doesn't get silently skipped without a trace: every test in
 *  the suite is `it.skip`'d with the reason printed in the test name
 *  itself, so a `vitest run` listing still shows exactly what wasn't
 *  exercised and why. */
export function runConformanceSuite(name: string, makeAdapter: () => VenueAdapter | null, opts?: { skipReason?: string }) {
  describe(`venue conformance: ${name}`, () => {
    const adapter = opts?.skipReason ? null : makeAdapter();
    const skipReason = opts?.skipReason ?? (adapter == null ? "makeAdapter() returned null (no credentials available)" : undefined);
    const test = skipReason ? it.skip : it;
    const label = skipReason ? ` (skipped: ${skipReason})` : "";

    test(`id/mode/currency are well-typed${label}`, () => {
      if (!adapter) return;
      expect(typeof adapter.id).toBe("string");
      expect(["paper", "demo", "live"]).toContain(adapter.mode);
      expect(["USD", "NGN", "MANA", "USDT"]).toContain(adapter.currency);
    });

    test(`listMarkets returns an array${label}`, async () => {
      if (!adapter) return;
      const markets = await adapter.listMarkets({ limit: 1 });
      expect(Array.isArray(markets)).toBe(true);
      for (const m of markets) {
        expect(typeof m.marketId).toBe("string");
        expect(m.venue).toBe(adapter.id);
      }
    });

    test(`getQuote returns null or a well-shaped Quote${label}`, async () => {
      if (!adapter) return;
      const markets = await adapter.listMarkets({ limit: 1 });
      if (markets.length === 0) return; // nothing to quote against; not a conformance failure
      const quote = await adapter.getQuote(markets[0]);
      if (quote == null) return;
      expect(quote.market).toEqual(markets[0]);
      expect(typeof quote.ts).toBe("number");
      if (quote.impliedProb != null) {
        expect(quote.impliedProb).toBeGreaterThanOrEqual(0);
        expect(quote.impliedProb).toBeLessThanOrEqual(1);
      }
    });

    test(`balance returns a {cash, currency} shape${label}`, async () => {
      if (!adapter) return;
      const balance = await adapter.balance();
      expect(typeof balance.cash).toBe("number");
      expect(["USD", "NGN", "MANA", "USDT"]).toContain(balance.currency);
    });
  });
}
