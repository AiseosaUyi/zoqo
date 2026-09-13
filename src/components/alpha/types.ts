/** Client-side shapes for the /api/alpha/* JSON responses — hand-typed
 *  rather than importing service.ts's return types directly, since a couple
 *  of those (listStrategies/listDecisions/listEvents) return raw Supabase
 *  Row types this "use client" tree shouldn't import server-only modules
 *  to reach. Kept intentionally loose (a few `unknown`s for JSONB columns)
 *  rather than re-deriving the full Database["public"]["Tables"] shapes. */

export interface AlphaSettingsDto {
  killSwitch: boolean;
  leagues: string[];
  baseCurrency: string;
}

export interface AlphaVenueDto {
  venue: string;
  mode: string;
  enabled: boolean;
  currency: string;
  maxStake: number;
  dailyCap: number;
  dailyLossStop: number;
  spentToday: number;
  pnlToday: number;
}

export interface AlphaStrategyDto {
  id: string;
  user_id: string;
  strategy_key: string;
  name: string;
  venue: string;
  enabled: boolean;
  params: unknown;
  schedule: unknown;
  budget: number;
  budget_floor: number;
  max_stake: number;
  daily_cap: number;
  daily_loss_stop: number;
  kelly_fraction: number;
  min_edge: number;
  max_odds: number | null;
  cooldown_min: number;
  last_run_at: string | null;
  next_run_at: string;
  paused_reason: string | null;
  created_at: string;
}

export interface AlphaTemplateDto {
  key: string;
  venues: string[];
  schedule: { kind: string; everyMin?: number; expr?: string; on?: string };
  defaultParams: Record<string, unknown>;
}

export interface AlphaDecisionDto {
  id: string;
  strategy_id: string;
  venue: string;
  market_id: string;
  side: string;
  status: string;
  stake: number | null;
  edge: number | null;
  rationale: string;
  reject_reason: string | null;
  decided_at: string;
}

export interface AlphaEventDto {
  id: string;
  strategy_id: string | null;
  kind: string;
  payload: unknown;
  acknowledged: boolean;
  created_at: string;
}

// --- Football (Phase 3) ---

export interface AlphaFixturePredictionDto {
  home: number;
  draw: number;
  away: number;
  over25?: number;
  btts?: number;
}

export interface AlphaFixtureDto {
  id: string;
  league_id: string;
  season: number;
  kickoff_at: string;
  home_team: string;
  away_team: string;
  status: string;
  prediction: AlphaFixturePredictionDto | null;
  marketConsensus: AlphaFixturePredictionDto | null;
  edgeByOutcome: { home: number; draw: number; away: number } | null;
  booksUsed: number;
}

export type AlphaSlipOutcome = "home" | "draw" | "away";

export interface AlphaSlipSelection {
  fixtureId: string;
  market: "1x2";
  outcome: AlphaSlipOutcome;
}

export interface AlphaSlipSelectionResultDto {
  fixtureId: string;
  fixtureLabel: string;
  market: string;
  outcome: string;
  book: string;
  decimalOdds: number;
  impliedProb: number;
  marketProbRemoved: number | null;
  modelProb: number | null;
  edge: number | null;
  kellyStakeFraction: number | null;
}

export interface AlphaSlipResultDto {
  selections: AlphaSlipSelectionResultDto[];
  combinedOdds: number;
  suggestedStake: number | null;
  plainText: string;
  placed?: { decisionId: string; orderId: string | null; status: string };
  error?: string;
}
