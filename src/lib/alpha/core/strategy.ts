/** Strategy contract (docs/alpha/03-architecture.md §2). A "strategy" is a
 *  plain module registered in src/lib/alpha/strategies/index.ts; a user's
 *  *instance* of one (params, budget, enabled, venue, schedule) is a row in
 *  `alpha_strategies`. runner.ts is the only caller of `.evaluate()`. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { MarketRef, Quote, VenueAdapter, Intent } from "./venue";

export type StrategySchedule =
  | { kind: "interval"; everyMin: number }
  | { kind: "cron"; expr: string }
  | { kind: "event"; on: "fixture-T-minus-60" | "price-cross" };

/** Feature providers are per-domain (price series, football fixtures,
 *  prediction-market order books) and land with the phase that needs them
 *  (Phase 1: price only; Phase 2: market; Phase 3: fixture). Declared here
 *  as the shape strategies code against, kept intentionally loose
 *  (Record<string, number | string>) since each domain's real vector is
 *  defined in its own feature module (src/lib/alpha/features/*.ts) — this
 *  interface is what StrategyCtx exposes, not the vector's schema. */
export interface FeatureProvider {
  getPriceFeatures?(assetId: string): Promise<Record<string, number | string> | null>;
  /** Raw ordered series, ascending by ts — for strategies (e.g. a moving-
   *  average crossover) that need to compare two overlapping windows
   *  themselves rather than a single feature snapshot. */
  getPriceSeries?(assetId: string): Promise<{ price: number; ts: number }[] | null>;
  getFixtureFeatures?(fixtureId: string): Promise<Record<string, number | string> | null>;
  getMarketFeatures?(market: MarketRef): Promise<Record<string, number | string> | null>;
}

export interface StrategyCtx {
  userId: string;
  now: number;
  venue: VenueAdapter;
  budget: { available: number; currency: string };
  features: FeatureProvider;
  quotes: (m: MarketRef) => Promise<Quote | null>;
  /** Strategy-instance params from `alpha_strategies.params` — editable from
   *  the UI/MCP without a code change. Each strategy module defines and
   *  validates its own params shape against `defaultParams`. */
  params: Record<string, unknown>;
  log: (msg: string, data?: unknown) => void;
  /** Direct DB access — added for copy-trading strategies (docs/alpha/
   *  08-copy-trading.md), which need to read their own `alpha_copy_sources`/
   *  `alpha_source_fills` rows directly rather than through a feature
   *  provider (no per-domain feature shape fits "which sources am I
   *  following"). Every other strategy still only touches `venue`/
   *  `features`/`quotes`, so this stays optional rather than forcing every
   *  existing strategy to declare it's unused. */
  supabase?: SupabaseClient<Database>;
}

export interface Strategy {
  /** Matches `alpha_strategies.strategy_key` — the registry lookup key. */
  key: string;
  venues: import("./venue").VenueId[];
  schedule: StrategySchedule;
  defaultParams: Record<string, unknown>;
  /** Optional weekly walk-forward parameter search space (docs/alpha/03-
   *  architecture.md §7 Level 4, `src/lib/alpha/paramSearch.ts`). Additive —
   *  a strategy that omits this is simply never considered for a search,
   *  which is the safe default, not a broken one. Each key should name a
   *  real `defaultParams` tunable; `paramSearch.ts` caps the Cartesian
   *  product it searches, so this isn't an invitation to declare a huge
   *  space. See `paramSearch.ts`'s `scoreCandidate` for which param SHAPES
   *  (threshold-like `min*`/`max*` names matching a logged feature) can
   *  actually be re-scored from history — declaring a non-threshold param
   *  here (e.g. a window size) is honest but won't move the search's score. */
  paramSpace?: Record<string, number[]>;
  /** Maps a `paramSpace` key to the `alpha_decisions.features` key
   *  `paramSearch.ts`'s `scoreCandidate` should compare it against — needed
   *  because a strategy's tunable param name and the feature name it logs
   *  are not always identical (e.g. `terminalHourlyMomentum`'s
   *  `minReturnAbs` param is checked against its own `return4h` feature,
   *  not a feature literally named `minReturnAbs`). A `paramSpace` key with
   *  no entry here falls back to matching a feature of the exact same name
   *  — the right default for a strategy where the threshold's name already
   *  matches what it logs. Only meaningful alongside `paramSpace`. */
  paramFeatureKeys?: Record<string, string>;
  evaluate(ctx: StrategyCtx): Promise<Intent[]>;
}
