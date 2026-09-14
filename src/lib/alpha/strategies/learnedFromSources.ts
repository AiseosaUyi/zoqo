import type { Strategy } from "../core/strategy";

/** Phase 2 of copy trading (docs/alpha/08-copy-trading.md §5, explicitly
 *  scoped there as "(both, phase 2)" and dependent on "200+ copies" of
 *  real logged fills existing first) — trades the fitted *pattern* good
 *  sources follow (market type, entry price, timing, size) rather than
 *  copying a specific person, using the same features every
 *  `alpha_source_fills` row already logs. Registered now (so
 *  `list_strategy_templates` and the leaderboard have a stable key to
 *  reference) but genuinely a stub: `paramSearch.ts`'s weekly walk-forward
 *  fit is what should populate this once `polymarket-copy-sources`/
 *  `manifold-copy-sources` have accumulated enough real fills to fit
 *  against — inventing a pattern from zero real copies would be fabricated
 *  signal, not a model. */
export const learnedFromSources: Strategy = {
  key: "learned-from-sources",
  venues: ["polymarket-sim", "manifold"],
  schedule: { kind: "interval", everyMin: 60 },
  defaultParams: {},

  async evaluate(ctx) {
    ctx.log("learned-from-sources is a phase-2 stub — no fitted pattern exists yet (needs 200+ real alpha_source_fills rows first, per docs/alpha/08-copy-trading.md §5)");
    return [];
  },
};
