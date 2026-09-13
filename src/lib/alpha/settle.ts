import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PlacedOrder, VenueId } from "./core/venue";
import { createVenueAdapter } from "./venues";
import { recordVenuePnl } from "./service";

/** `/api/cron/alpha-settle` calls `settleOpenOrders` — the runner never
 *  settles inline (a strategy's `evaluate()` only ever produces Intents,
 *  never resolves them), so settlement is its own pass, same separation as
 *  `alpha-run` vs `alpha-settle` in docs/alpha/03-architecture.md's diagram.
 *  Groups open orders by (user, venue) since a VenueAdapter is constructed
 *  per user. */

type Client = SupabaseClient<Database>;

export async function settleOpenOrders(supabase: Client) {
  const { data: openOrders } = await supabase
    .from("alpha_orders")
    .select("*")
    .in("status", ["open", "filled", "partial"]);
  if (!openOrders || openOrders.length === 0) return { checked: 0, settled: 0 };

  const groups = new Map<string, { userId: string; venue: VenueId; orders: typeof openOrders }>();
  for (const order of openOrders) {
    const key = `${order.user_id}:${order.venue}`;
    const g = groups.get(key);
    if (g) g.orders.push(order);
    else groups.set(key, { userId: order.user_id, venue: order.venue as VenueId, orders: [order] });
  }

  let settledCount = 0;
  for (const { userId, venue, orders } of groups.values()) {
    let adapter;
    try {
      adapter = createVenueAdapter(venue, supabase, userId);
    } catch {
      continue; // venue not implemented yet — nothing to settle against
    }

    const placedOrders: PlacedOrder[] = orders.map((o) => ({
      venueOrderId: o.venue_order_id,
      market: { venue, marketId: o.market_id, outcomeId: o.outcome_id ?? undefined },
      side: o.side as PlacedOrder["side"],
      stake: o.stake,
      currency: o.currency as PlacedOrder["currency"],
      priceOrOdds: o.price_or_odds,
      placedAt: new Date(o.placed_at).getTime(),
      status: o.status as PlacedOrder["status"],
    }));

    let settlements;
    try {
      settlements = await adapter.settle(placedOrders);
    } catch {
      continue;
    }

    for (const s of settlements) {
      const order = orders.find((o) => o.venue_order_id === s.venueOrderId);
      if (!order) continue;
      await supabase
        .from("alpha_orders")
        .update({
          status: "settled",
          outcome: s.outcome,
          pnl: s.pnl,
          closing_price_or_odds: s.closingPriceOrOdds ?? null,
          settled_at: new Date(s.settledAt).toISOString(),
        })
        .eq("id", order.id);
      await recordVenuePnl(supabase, userId, venue, s.pnl);
      settledCount++;
    }
  }

  return { checked: openOrders.length, settled: settledCount };
}
