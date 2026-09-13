import { describe, expect, it } from "vitest";
import { exceedsRequestedStake } from "../service";

/** `placeIntent` (docs/alpha/PROMPT-alpha-finish.md §2) is the MCP
 *  `place_intent` tool's backing function — it goes through the same
 *  `evaluateIntent` risk gate a strategy's own intents use, but adds one
 *  pre-check on top: since the caller named an exact stake, exceeding what
 *  the gate would allow gets rejected outright (and logged to
 *  `alpha_decisions` with reason `stake_exceeds_max_stake`) rather than
 *  silently downsized. `exceedsRequestedStake` is that check, extracted as
 *  a pure function so it's unit-testable without a Supabase client — same
 *  "pure decision logic, no I/O" discipline `risk.ts`'s `evaluateIntent`
 *  itself follows (see risk.test.ts), which this test suite mirrors rather
 *  than duplicating a live-DB integration test the rest of service.ts has
 *  no precedent for. */
describe("exceedsRequestedStake (place_intent's stake pre-check)", () => {
  it("rejects a stake above the effective max_stake (min of strategy and venue caps)", () => {
    expect(exceedsRequestedStake(1000, /* strategyMaxStake */ 250, /* venueMaxStake */ 500)).toBe(true);
    expect(exceedsRequestedStake(1000, /* strategyMaxStake */ 500, /* venueMaxStake */ 250)).toBe(true);
  });

  it("accepts a stake at or under the effective max_stake", () => {
    expect(exceedsRequestedStake(250, 250, 500)).toBe(false);
    expect(exceedsRequestedStake(100, 250, 500)).toBe(false);
  });

  it("never rejects when no stake was requested — sizing falls through to the normal risk gate", () => {
    expect(exceedsRequestedStake(undefined, 1, 1)).toBe(false);
  });
});
