/** Strategy contract (docs/alpha/03-architecture.md §2). A "strategy" is a
 *  plain module registered in src/lib/alpha/strategies/index.ts; a user's
 *  *instance* of one (params, budget, enabled, venue, schedule) is a row in
 *  `alpha_strategies`. runner.ts is the only caller of `.evaluate()`. */

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
}

export interface Strategy {
  /** Matches `alpha_strategies.strategy_key` — the registry lookup key. */
  key: string;
  venues: import("./venue").VenueId[];
  schedule: StrategySchedule;
  defaultParams: Record<string, unknown>;
  evaluate(ctx: StrategyCtx): Promise<Intent[]>;
}
