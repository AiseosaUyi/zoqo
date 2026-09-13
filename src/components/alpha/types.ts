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
