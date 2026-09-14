import { describe, expect, it } from "vitest";
import { assertVenueModeNotLive } from "../service";

/** docs/alpha/PROMPT-alpha-finish.md §7: `VenueMode` keeps `"live"` as a
 *  type member only so Intent/order plumbing type-checks against a real
 *  venue SDK's own mode field (core/venue.ts's header) — no adapter
 *  constructor in this program is ever built with it, and the
 *  `alpha_venues.mode` check constraint physically disallows storing it.
 *  `assertVenueModeNotLive` is the runtime backstop for "should never
 *  happen": both `rowToVenue` (every `alpha_venues` row this module reads)
 *  and `getVenueAdapter` (the one chokepoint `service.ts`, `runner.ts`, and
 *  `settle.ts` all construct adapters through) call it first. */
describe("assertVenueModeNotLive", () => {
  it("throws for a live mode, naming the context", () => {
    expect(() => assertVenueModeNotLive("live", "adapter for venue \"manifold\"")).toThrow(/live/i);
    expect(() => assertVenueModeNotLive("live", "adapter for venue \"manifold\"")).toThrow(/manifold/);
  });

  it("passes through paper and demo without throwing", () => {
    expect(() => assertVenueModeNotLive("paper", "test")).not.toThrow();
    expect(() => assertVenueModeNotLive("demo", "test")).not.toThrow();
  });
});
