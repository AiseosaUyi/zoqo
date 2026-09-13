import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PlacedOrder } from "../../core/venue";
import { runConformanceSuite } from "./conformance";
import { createPolymarketSimAdapter, walkOrderBook } from "../polymarketSim";

/** Fakes exactly the `alpha_ledger` call shapes `polymarketSim.ts` makes
 *  (select().eq().eq().maybeSingle(), insert().select().single(),
 *  update().eq().eq().eq().select() awaited directly) against an in-memory
 *  row — this build environment has no live Supabase project linked
 *  (docs/alpha/STATUS.md), so there is no real Postgres to hit for the
 *  ledger. Gamma/CLOB, by contrast, are genuinely public REST APIs reached
 *  over the real network below (see the conformance run's own comment). */
function createFakeLedgerClient(): SupabaseClient<Database> {
  let row: { balance: number; updated_at: string } | null = null;

  function makeBuilder(kind: "select" | "insert" | "update", payload?: { balance: number; updated_at?: string }) {
    let matchedUpdatedAt: string | undefined;
    const builder = {
      eq(column: string, value: unknown) {
        if (kind === "update" && column === "updated_at") matchedUpdatedAt = value as string;
        return builder;
      },
      select() {
        return builder;
      },
      async maybeSingle() {
        return { data: kind === "select" ? row : null, error: null };
      },
      async single() {
        if (kind === "insert" && payload) {
          row = { balance: payload.balance, updated_at: new Date().toISOString() };
        }
        return { data: row, error: null };
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (kind === "update" && payload) {
          if (row && matchedUpdatedAt === row.updated_at) {
            row = { balance: payload.balance, updated_at: payload.updated_at ?? new Date().toISOString() };
            resolve({ data: [{ user_id: "fake-user" }], error: null });
          } else {
            resolve({ data: [], error: null });
          }
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      if (table !== "alpha_ledger") throw new Error(`fake client only supports alpha_ledger, got "${table}"`);
      return {
        select() {
          return makeBuilder("select");
        },
        insert(newRow: { balance: number }) {
          return makeBuilder("insert", newRow);
        },
        update(patch: { balance: number; updated_at: string }) {
          return makeBuilder("update", patch);
        },
      };
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

const USER_ID = "00000000-0000-0000-0000-000000000000";

// Polymarket's Gamma/CLOB reads are genuinely public and keyless
// (polymarketSim.ts's own header) — verified reachable from this sandbox
// while building this adapter (plain curl to both hosts returned 200), so
// this conformance run genuinely hits the live network for
// listMarkets/getQuote rather than skipping. balance() still needs a
// Supabase client for alpha_ledger, which this environment doesn't have
// live — the fake ledger above stands in for that one piece so the full
// suite can run instead of being skipped wholesale.
runConformanceSuite("polymarket-sim", () => createPolymarketSimAdapter(createFakeLedgerClient(), USER_ID));

describe("walkOrderBook", () => {
  it("fills entirely within the best level when liquidity is sufficient", () => {
    const result = walkOrderBook([{ price: 0.5, size: 100 }], 25);
    expect(result.filledShares).toBeCloseTo(50, 6);
    expect(result.cost).toBeCloseTo(25, 6);
    expect(result.avgPrice).toBeCloseTo(0.5, 6);
    expect(result.remaining).toBeCloseTo(0, 6);
  });

  it("walks multiple levels and computes a volume-weighted average price", () => {
    // level 1: 0.4*10=4 (fully consumed); level 2: remaining 6 / 0.6 = 10 shares, cost 6
    const result = walkOrderBook(
      [
        { price: 0.4, size: 10 },
        { price: 0.6, size: 100 },
      ],
      10,
    );
    expect(result.filledShares).toBeCloseTo(20, 6);
    expect(result.cost).toBeCloseTo(10, 6);
    expect(result.avgPrice).toBeCloseTo(0.5, 6);
    expect(result.remaining).toBeCloseTo(0, 6);
  });

  it("returns a partial fill with leftover stake when the book runs out", () => {
    const result = walkOrderBook([{ price: 0.5, size: 10 }], 100);
    expect(result.filledShares).toBeCloseTo(10, 6);
    expect(result.cost).toBeCloseTo(5, 6);
    expect(result.remaining).toBeCloseTo(95, 6);
  });

  it("returns a zero fill on an empty book", () => {
    const result = walkOrderBook([], 50);
    expect(result).toEqual({ filledShares: 0, cost: 0, avgPrice: 0, remaining: 50 });
  });

  it("skips non-positive levels defensively", () => {
    const result = walkOrderBook([{ price: 0, size: 10 }, { price: 0.5, size: 10 }], 5);
    expect(result.filledShares).toBeCloseTo(10, 6);
    expect(result.cost).toBeCloseTo(5, 6);
  });
});

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

describe("createPolymarketSimAdapter place()/settle() (mocked fetch, no live network)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("walks the book, debits the ledger, and returns a VWAP fill price", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/book?")) return Promise.resolve(jsonResponse({ bids: [], asks: [{ price: "0.5", size: "100" }] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    const adapter = createPolymarketSimAdapter(createFakeLedgerClient(), USER_ID);
    const order = await adapter.place(
      { strategyId: "s", market: { venue: "polymarket-sim", marketId: "123", outcomeId: "tok-yes" }, side: "yes", kind: "market", edge: 0.1, rationale: "t" },
      25,
      { userId: USER_ID, now: Date.now() },
    );
    expect(order.status).toBe("filled");
    expect(order.priceOrOdds).toBeCloseTo(0.5, 6);
    expect(order.stake).toBeCloseTo(25, 6);

    const balance = await adapter.balance();
    expect(balance.cash).toBeCloseTo(1000 - 25, 6);
  });

  it("returns partial (not rejected) when the book can't fully fill the stake", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/book?")) return Promise.resolve(jsonResponse({ bids: [], asks: [{ price: "0.5", size: "10" }] }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    const adapter = createPolymarketSimAdapter(createFakeLedgerClient(), USER_ID);
    const order = await adapter.place(
      { strategyId: "s", market: { venue: "polymarket-sim", marketId: "123", outcomeId: "tok-yes" }, side: "yes", kind: "market", edge: 0.1, rationale: "t" },
      100,
      { userId: USER_ID, now: Date.now() },
    );
    expect(order.status).toBe("partial");
    expect(order.stake).toBeCloseTo(5, 6); // only $5 of book depth existed (0.5 * 10 shares)
  });

  it("rejects when the book has no asks at all", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ bids: [], asks: [] })));
    const adapter = createPolymarketSimAdapter(createFakeLedgerClient(), USER_ID);
    const order = await adapter.place(
      { strategyId: "s", market: { venue: "polymarket-sim", marketId: "1", outcomeId: "tok" }, side: "yes", kind: "market", edge: 0.1, rationale: "t" },
      10,
      { userId: USER_ID, now: Date.now() },
    );
    expect(order.status).toBe("rejected");
  });

  it("settle() pays out on a resolved winner and leaves an unresolved market open", async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/markets/won-market")) {
        return Promise.resolve(
          jsonResponse({ id: "won-market", closed: true, clobTokenIds: JSON.stringify(["tok-yes", "tok-no"]), outcomePrices: JSON.stringify(["1", "0"]) }),
        );
      }
      if (u.includes("/markets/open-market")) {
        return Promise.resolve(jsonResponse({ id: "open-market", closed: false }));
      }
      throw new Error(`unexpected fetch: ${u}`);
    });

    const adapter = createPolymarketSimAdapter(createFakeLedgerClient(), USER_ID);
    const won: PlacedOrder = {
      venueOrderId: "o1",
      market: { venue: "polymarket-sim", marketId: "won-market", outcomeId: "tok-yes" },
      side: "yes",
      stake: 25,
      currency: "USD",
      priceOrOdds: 0.5,
      placedAt: Date.now(),
      status: "filled",
    };
    const stillOpen: PlacedOrder = { ...won, venueOrderId: "o2", market: { venue: "polymarket-sim", marketId: "open-market", outcomeId: "tok-yes" } };

    const settlements = await adapter.settle([won, stillOpen]);
    expect(settlements).toHaveLength(1);
    expect(settlements[0].venueOrderId).toBe("o1");
    expect(settlements[0].outcome).toBe("won");
    // shares = 25 / 0.5 = 50; payout = 50*1 - 25 = 25
    expect(settlements[0].pnl).toBeCloseTo(25, 6);
  });
});
