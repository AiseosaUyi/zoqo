import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueAdapter, VenueId } from "../core/venue";
import { createZoqoTerminalAdapter } from "./zoqoTerminal";
import { createManifoldAdapterForUser } from "./manifold";

/** Venue adapter factory — one place that knows how to construct every
 *  VenueAdapter for a given user. Phase 1 implemented `zoqo-terminal`;
 *  Phase 2 adds `manifold` (see manifold.ts's `createManifoldAdapterForUser`
 *  header for why this stays synchronous rather than becoming async to
 *  thread through an API-key lookup). Every other VenueId is a real member
 *  of the type (Phase 3-4 build them) but throws here until then, so a
 *  strategy misconfigured onto an unbuilt venue fails loudly in
 *  `alpha_runs.error` instead of silently no-oping. */
export function createVenueAdapter(venue: VenueId, supabase: SupabaseClient<Database>, userId: string): VenueAdapter {
  switch (venue) {
    case "zoqo-terminal":
      return createZoqoTerminalAdapter(supabase, userId);
    case "manifold":
      return createManifoldAdapterForUser(userId);
    case "zoqo-predict":
    case "zoqo-sportsbook":
    case "kalshi-demo":
    case "bybit-demo":
    case "deriv-virtual":
    case "polymarket-sim":
      throw new Error(`venue "${venue}" is not implemented yet (see docs/alpha/07-build-plan.md's phase order)`);
  }
}
