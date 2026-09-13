import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueAdapter, VenueId } from "../core/venue";
import { createZoqoTerminalAdapter } from "./zoqoTerminal";
import { createManifoldAdapterForUser } from "./manifold";
import { createZoqoSportsbookAdapter } from "./zoqoSportsbook";
import { createKalshiDemoAdapterForUser } from "./kalshiDemo";
import { createBybitDemoAdapterForUser } from "./bybitDemo";
import { createDerivVirtualAdapterForUser } from "./derivVirtual";
import { createPolymarketSimAdapter } from "./polymarketSim";

/** Venue adapter factory — one place that knows how to construct every
 *  VenueAdapter for a given user. Phase 1 implemented `zoqo-terminal`;
 *  Phase 2 added `manifold` (see manifold.ts's `createManifoldAdapterForUser`
 *  header for why this stays synchronous rather than becoming async to
 *  thread through an API-key lookup); Phase 3 added `zoqo-sportsbook`; Phase
 *  4 adds `kalshi-demo`/`bybit-demo`/`deriv-virtual`/`polymarket-sim` — the
 *  first three follow the exact same lazy-credential-resolution pattern as
 *  `manifold.ts` (a `*ForUser` wrapper resolves the secret on first method
 *  call, memoized), keeping this factory synchronous throughout. `zoqo-
 *  predict` is the only VenueId with no adapter yet (out of every phase's
 *  scope so far — `/trade`'s engine stays client-side per the architecture
 *  doc) — a strategy misconfigured onto it fails loudly in
 *  `alpha_runs.error` instead of silently no-oping. */
export function createVenueAdapter(venue: VenueId, supabase: SupabaseClient<Database>, userId: string): VenueAdapter {
  switch (venue) {
    case "zoqo-terminal":
      return createZoqoTerminalAdapter(supabase, userId);
    case "manifold":
      return createManifoldAdapterForUser(userId);
    case "zoqo-sportsbook":
      return createZoqoSportsbookAdapter(supabase, userId);
    case "kalshi-demo":
      return createKalshiDemoAdapterForUser(userId);
    case "bybit-demo":
      return createBybitDemoAdapterForUser(userId);
    case "deriv-virtual":
      return createDerivVirtualAdapterForUser(userId);
    case "polymarket-sim":
      return createPolymarketSimAdapter(supabase, userId);
    case "zoqo-predict":
      throw new Error(`venue "${venue}" is not implemented yet (see docs/alpha/07-build-plan.md's phase order)`);
  }
}
