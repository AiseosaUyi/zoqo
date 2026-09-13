import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueAdapter, VenueId } from "../core/venue";
import { createZoqoTerminalAdapter } from "./zoqoTerminal";

/** Venue adapter factory — one place that knows how to construct every
 *  VenueAdapter for a given user. Phase 1 only implements `zoqo-terminal`;
 *  every other VenueId is a real member of the type (Phase 2-4 build them)
 *  but throws here until then, so a strategy misconfigured onto an
 *  unbuilt venue fails loudly in `alpha_runs.error` instead of silently
 *  no-oping. */
export function createVenueAdapter(venue: VenueId, supabase: SupabaseClient<Database>, userId: string): VenueAdapter {
  switch (venue) {
    case "zoqo-terminal":
      return createZoqoTerminalAdapter(supabase, userId);
    case "zoqo-predict":
    case "zoqo-sportsbook":
    case "manifold":
    case "kalshi-demo":
    case "bybit-demo":
    case "deriv-virtual":
    case "polymarket-sim":
      throw new Error(`venue "${venue}" is not implemented yet (see docs/alpha/07-build-plan.md's phase order)`);
  }
}
