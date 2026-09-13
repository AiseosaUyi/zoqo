import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { openTerminalPosition, closeTerminalPosition } from "@/lib/server/terminalExecution";
import { getCryptoPrice, getQuotePrice } from "@/lib/serverPriceFeed";
import { ASSET_BY_ID } from "@/lib/assets";
import type { VenueAdapter } from "../core/venue";

/** ZOQO Alpha's first venue adapter — wraps the EXISTING terminal execution
 *  path (src/lib/server/terminalExecution.ts) unchanged, per the program's
 *  one hard rule: no second order path. This module owns zero order-math;
 *  it only translates between Alpha's venue-agnostic shapes and the
 *  terminal's existing functions/tables.
 *
 *  Ownership split for settlement: `alpha_orders` (this program's own
 *  bookkeeping) is the source of truth for which positions Alpha placed —
 *  `openOrders()` intentionally returns [] because the terminal's shared
 *  `positions` table has no "placed by Alpha" marker to enumerate from
 *  safely (a human can also hold positions there); `settle.ts` instead
 *  passes the exact set of Alpha-placed orders it needs checked into
 *  `settle(open)`, which is the only place that reads `positions` back. */

async function priceForAsset(assetId: string): Promise<number | null> {
  const asset = ASSET_BY_ID[assetId];
  if (!asset) return null;
  const result = asset.assetClass === "crypto" ? await getCryptoPrice(assetId) : await getQuotePrice(assetId);
  return result?.price ?? null;
}

export function createZoqoTerminalAdapter(supabase: SupabaseClient<Database>, userId: string): VenueAdapter {
  return {
    id: "zoqo-terminal",
    mode: "paper",
    currency: "USD",

    async listMarkets({ query, limit }) {
      const assets = Object.values(ASSET_BY_ID);
      const q = query?.toLowerCase();
      const filtered = q ? assets.filter((a) => a.id.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q)) : assets;
      return filtered.slice(0, limit ?? 50).map((a) => ({ venue: "zoqo-terminal" as const, marketId: a.id }));
    },

    async getQuote(m) {
      const price = await priceForAsset(m.marketId);
      if (price == null) return null;
      return { market: m, ts: Date.now(), last: price, bid: price, ask: price };
    },

    async place(intent, stake, ctx) {
      const price = await priceForAsset(intent.market.marketId);
      if (price == null) {
        return {
          venueOrderId: "",
          market: intent.market,
          side: intent.side,
          stake,
          currency: "USD",
          priceOrOdds: 0,
          placedAt: ctx.now,
          status: "rejected",
        };
      }
      const side: "long" | "short" = intent.side === "short" ? "short" : "long";
      const qty = stake / price;
      const result = await openTerminalPosition(supabase, userId, {
        assetId: intent.market.marketId,
        side,
        qty,
        price,
        opts: { stopLoss: intent.stopLoss, takeProfit: intent.takeProfit },
      });
      if (!result.ok) {
        return {
          venueOrderId: "",
          market: intent.market,
          side: intent.side,
          stake,
          currency: "USD",
          priceOrOdds: price,
          placedAt: ctx.now,
          status: "rejected",
        };
      }
      return {
        venueOrderId: result.position.id,
        market: intent.market,
        side: intent.side,
        stake,
        currency: "USD",
        priceOrOdds: price,
        placedAt: ctx.now,
        status: "filled",
      };
    },

    // See module header: alpha_orders, not this adapter, enumerates "mine".
    async openOrders() {
      return [];
    },

    async settle(open) {
      const settlements = [];
      for (const order of open) {
        if (!order.venueOrderId) continue;
        const { data: row } = await supabase
          .from("positions")
          .select("*")
          .eq("id", order.venueOrderId)
          .eq("user_id", userId)
          .eq("kind", "terminal")
          .maybeSingle();
        // Missing row = already closed by some other path (Phase 1 doesn't
        // reconcile third-party closes of an Alpha-opened position — the
        // shared wallet means a human could close it from /terminal too;
        // that reconciliation gap is recorded in STATUS.md, not silently
        // papered over).
        if (!row || row.asset_id == null) continue;

        const price = await priceForAsset(row.asset_id);
        if (price == null) continue;

        const side = row.side as "long" | "short";
        const stopHit = row.stop_loss != null && (side === "long" ? price <= row.stop_loss : price >= row.stop_loss);
        const takeHit = row.take_profit != null && (side === "long" ? price >= row.take_profit : price <= row.take_profit);
        if (!stopHit && !takeHit) continue; // still open, nothing to settle yet

        const exitPrice = stopHit ? row.stop_loss! : row.take_profit!;
        const closed = await closeTerminalPosition(supabase, userId, order.venueOrderId, exitPrice);
        if (!closed.ok) continue;

        settlements.push({
          venueOrderId: order.venueOrderId,
          outcome: closed.historyEntry.pnl >= 0 ? ("won" as const) : ("lost" as const),
          pnl: closed.historyEntry.pnl,
          settledAt: Date.now(),
          closingPriceOrOdds: closed.historyEntry.exitPrice,
        });
      }
      return settlements;
    },

    async balance() {
      const { data } = await supabase.from("wallets").select("cash").eq("user_id", userId).maybeSingle();
      return { cash: data?.cash ?? 0, currency: "USD" };
    },
  };
}
