import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueId } from "./core/venue";
import type { RiskGateStrategyConfig, RiskGateVenueConfig } from "./risk";
import { listStrategyTemplates as registryTemplates, getStrategyTemplate } from "./strategies";

/** The one service layer every door (the `/api/alpha/*` route handlers for
 *  the UI, the `/api/cron/alpha-*` routes for the scheduler, and — from
 *  Phase 2 on — the MCP tools) calls into. No business logic lives in a
 *  route handler; every route is a thin auth-check + call into a function
 *  here (docs/alpha/03-architecture.md §10). */

type Client = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayStartIso(now: number): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Settings & kill switch
// ---------------------------------------------------------------------------

export interface AlphaSettings {
  killSwitch: boolean;
  leagues: string[];
  baseCurrency: string;
}

export async function getSettings(supabase: Client, userId: string): Promise<AlphaSettings> {
  const { data } = await supabase
    .from("alpha_settings")
    .select("kill_switch, leagues, base_currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { killSwitch: false, leagues: [], baseCurrency: "NGN" };
  return { killSwitch: data.kill_switch, leagues: data.leagues, baseCurrency: data.base_currency };
}

export async function setSettings(
  supabase: Client,
  userId: string,
  patch: { leagues?: string[]; baseCurrency?: string },
): Promise<void> {
  await supabase.from("alpha_settings").upsert(
    {
      user_id: userId,
      ...(patch.leagues != null ? { leagues: patch.leagues } : {}),
      ...(patch.baseCurrency != null ? { base_currency: patch.baseCurrency } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function setKillSwitch(supabase: Client, userId: string, on: boolean, reason?: string): Promise<void> {
  await supabase
    .from("alpha_settings")
    .upsert({ user_id: userId, kill_switch: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  await supabase.from("alpha_events").insert({
    user_id: userId,
    kind: "kill",
    payload: { on, reason: reason ?? null },
  });
}

// ---------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------

const VENUE_DEFAULT_CURRENCY: Record<VenueId, string> = {
  "zoqo-terminal": "USD",
  "zoqo-predict": "USD",
  "zoqo-sportsbook": "NGN",
  manifold: "MANA",
  "kalshi-demo": "USD",
  "bybit-demo": "USDT",
  "deriv-virtual": "USD",
  "polymarket-sim": "USD",
};

export interface VenueRow {
  venue: VenueId;
  mode: "paper" | "demo";
  enabled: boolean;
  currency: string;
  maxStake: number;
  dailyCap: number;
  dailyLossStop: number;
  spentToday: number;
  pnlToday: number;
}

const DEFAULT_VENUE_CAPS = { max_stake: 100, daily_cap: 500, daily_loss_stop: 200 };

/** Reads a user's `alpha_venues` row, auto-provisioning a disabled default
 *  row on first reference so every other function can assume the row
 *  exists — a strategy targeting a venue for the first time doesn't need a
 *  separate "set it up" step, but it DOES start disabled (schema default),
 *  so nothing trades until a human (or MCP `set_venue`) opts in. */
export async function getOrCreateVenue(supabase: Client, userId: string, venue: VenueId): Promise<VenueRow> {
  const { data } = await supabase.from("alpha_venues").select("*").eq("user_id", userId).eq("venue", venue).maybeSingle();
  if (data) return rowToVenue(data, Date.now());

  const currency = VENUE_DEFAULT_CURRENCY[venue];
  const insertRow = {
    user_id: userId,
    venue,
    mode: "paper" as const,
    enabled: false,
    currency,
    ...DEFAULT_VENUE_CAPS,
  };
  const { data: inserted } = await supabase.from("alpha_venues").insert(insertRow).select("*").single();
  return rowToVenue(inserted ?? { ...insertRow, spent_today: 0, pnl_today: 0, day_reset_at: new Date().toISOString() }, Date.now());
}

function rowToVenue(
  row: {
    venue: string;
    mode: string;
    enabled: boolean;
    currency: string;
    max_stake: number;
    daily_cap: number;
    daily_loss_stop: number;
    spent_today: number;
    pnl_today: number;
    day_reset_at: string;
  },
  now: number,
): VenueRow {
  const windowExpired = now - new Date(row.day_reset_at).getTime() > DAY_MS;
  return {
    venue: row.venue as VenueId,
    mode: row.mode as "paper" | "demo",
    enabled: row.enabled,
    currency: row.currency,
    maxStake: row.max_stake,
    dailyCap: row.daily_cap,
    dailyLossStop: row.daily_loss_stop,
    spentToday: windowExpired ? 0 : row.spent_today,
    pnlToday: windowExpired ? 0 : row.pnl_today,
  };
}

export async function listVenues(supabase: Client, userId: string): Promise<VenueRow[]> {
  const { data } = await supabase.from("alpha_venues").select("*").eq("user_id", userId);
  const now = Date.now();
  return (data ?? []).map((r) => rowToVenue(r, now));
}

export async function setVenue(
  supabase: Client,
  userId: string,
  input: { venue: VenueId; enabled?: boolean; maxStake?: number; dailyCap?: number; dailyLossStop?: number },
): Promise<void> {
  await getOrCreateVenue(supabase, userId, input.venue); // ensure the row exists first
  await supabase
    .from("alpha_venues")
    .update({
      ...(input.enabled != null ? { enabled: input.enabled } : {}),
      ...(input.maxStake != null ? { max_stake: input.maxStake } : {}),
      ...(input.dailyCap != null ? { daily_cap: input.dailyCap } : {}),
      ...(input.dailyLossStop != null ? { daily_loss_stop: input.dailyLossStop } : {}),
    })
    .eq("user_id", userId)
    .eq("venue", input.venue);
}

/** Records a fill against a venue's daily spend counter — called by
 *  runner.ts right after a successful `venue.place()`. Rolls the window
 *  forward first if it's stale, same 24h pattern as
 *  `automation_triggers.spent_today_reset_at`. */
export async function recordVenueSpend(supabase: Client, userId: string, venue: VenueId, stake: number): Promise<void> {
  const row = await getOrCreateVenue(supabase, userId, venue);
  await supabase
    .from("alpha_venues")
    .update({ spent_today: row.spentToday + stake, day_reset_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("venue", venue);
}

export async function recordVenuePnl(supabase: Client, userId: string, venue: VenueId, pnl: number): Promise<void> {
  const row = await getOrCreateVenue(supabase, userId, venue);
  await supabase.from("alpha_venues").update({ pnl_today: row.pnlToday + pnl }).eq("user_id", userId).eq("venue", venue);
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export function listStrategyTemplates() {
  return registryTemplates().map((s) => ({ key: s.key, venues: s.venues, schedule: s.schedule, defaultParams: s.defaultParams }));
}

export interface CreateStrategyInput {
  strategyKey: string;
  name: string;
  venue: VenueId;
  params?: Record<string, unknown>;
  schedule?: { kind: "interval"; everyMin: number } | { kind: "cron"; expr: string } | { kind: "event"; on: string };
  budget: number;
  maxStake: number;
  dailyCap: number;
  dailyLossStop: number;
  kellyFraction?: number;
  minEdge?: number;
  maxOdds?: number;
  cooldownMin?: number;
}

export async function createStrategy(supabase: Client, userId: string, input: CreateStrategyInput) {
  const template = getStrategyTemplate(input.strategyKey);
  if (!template) throw new Error(`unknown strategy_key "${input.strategyKey}"`);
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("alpha_strategies")
    .insert({
      id,
      user_id: userId,
      strategy_key: input.strategyKey,
      name: input.name,
      venue: input.venue,
      enabled: false,
      params: (input.params ?? template.defaultParams) as never,
      schedule: (input.schedule ?? template.schedule) as never,
      budget: input.budget,
      max_stake: input.maxStake,
      daily_cap: input.dailyCap,
      daily_loss_stop: input.dailyLossStop,
      kelly_fraction: input.kellyFraction ?? 0.25,
      min_edge: input.minEdge ?? 0.02,
      max_odds: input.maxOdds ?? null,
      cooldown_min: input.cooldownMin ?? 60,
      next_run_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listStrategies(supabase: Client, userId: string) {
  const { data } = await supabase.from("alpha_strategies").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return data ?? [];
}

export async function updateStrategy(
  supabase: Client,
  userId: string,
  id: string,
  patch: Database["public"]["Tables"]["alpha_strategies"]["Update"],
) {
  const { error } = await supabase.from("alpha_strategies").update(patch).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function pauseStrategy(supabase: Client, userId: string, id: string, reason?: string) {
  await supabase.from("alpha_strategies").update({ enabled: false, paused_reason: reason ?? "manual pause" }).eq("id", id).eq("user_id", userId);
  await supabase.from("alpha_events").insert({ user_id: userId, strategy_id: id, kind: "paused", payload: { reason: reason ?? null } });
}

export async function resumeStrategy(supabase: Client, userId: string, id: string) {
  await supabase.from("alpha_strategies").update({ enabled: true, paused_reason: null }).eq("id", id).eq("user_id", userId);
  await supabase.from("alpha_events").insert({ user_id: userId, strategy_id: id, kind: "resumed", payload: {} });
}

/** Sets next_run_at to now so the next `alpha-run` tick (at most a minute
 *  away, per the cron schedule) picks it up — same "one runner, three
 *  doors" shape evaluate-triggers already uses for schedule-vs-manual. */
export async function runStrategyNow(supabase: Client, userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("alpha_strategies")
    .update({ next_run_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Decisions & events
// ---------------------------------------------------------------------------

export async function listDecisions(
  supabase: Client,
  userId: string,
  filters: { strategyId?: string; venue?: string; status?: "accepted" | "rejected"; limit?: number } = {},
) {
  let q = supabase.from("alpha_decisions").select("*").eq("user_id", userId).order("decided_at", { ascending: false });
  if (filters.strategyId) q = q.eq("strategy_id", filters.strategyId);
  if (filters.venue) q = q.eq("venue", filters.venue);
  if (filters.status) q = q.eq("status", filters.status);
  const { data } = await q.limit(filters.limit ?? 50);
  return data ?? [];
}

export async function listEvents(supabase: Client, userId: string, filters: { since?: string; limit?: number } = {}) {
  let q = supabase.from("alpha_events").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (filters.since) q = q.gte("created_at", filters.since);
  const { data } = await q.limit(filters.limit ?? 50);
  return data ?? [];
}

export async function ackEvent(supabase: Client, userId: string, id: string): Promise<void> {
  await supabase.from("alpha_events").update({ acknowledged: true }).eq("id", id).eq("user_id", userId);
}

// ---------------------------------------------------------------------------
// Proposals (docs/alpha/03-architecture.md §7 Level 4) — `kind='proposal'`
// alpha_events rows written by `paramSearch.ts`, applied or dismissed here.
// Never writes `alpha_strategies.params` from anywhere else in this program.
// ---------------------------------------------------------------------------

/** Shape of a `proposal` event's `payload`, as written by
 *  `paramSearch.ts`'s `runParamSearch` — kept loose (most fields optional)
 *  since `payload` is jsonb and this is read back, not enforced by the DB. */
export interface ProposalPayload {
  strategyId?: string;
  currentParams?: Record<string, unknown>;
  proposedParams?: Record<string, unknown>;
  expectedImprovement?: number;
  [key: string]: unknown;
}

export async function listProposals(supabase: Client, userId: string) {
  const { data } = await supabase
    .from("alpha_events")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "proposal")
    .eq("acknowledged", false)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Applies `eventId`'s proposed params onto its strategy's live `params`
 *  (merged, not replaced — `paramSpace` may cover only a subset of a
 *  strategy's tunables, and every strategy's `evaluate()` already reads
 *  `{...DEFAULT_PARAMS, ...ctx.params}`, so a partial merge is the correct
 *  "apply just what was proposed" semantics), marks the proposal
 *  acknowledged, and logs a new `applied` event. Ownership-checked twice:
 *  once on the event row (`user_id` + `kind` + not-yet-acknowledged), once
 *  again on the strategy the event's payload names — belt-and-braces per
 *  this phase's "never trust a client-supplied strategy id" rule, since the
 *  strategy id here comes out of a JSONB payload, not a typed column. */
export async function applyProposal(supabase: Client, userId: string, eventId: string): Promise<{ ok: true; strategyId: string; newParams: Record<string, unknown> }> {
  const { data: event } = await supabase
    .from("alpha_events")
    .select("*")
    .eq("id", eventId)
    .eq("user_id", userId)
    .eq("kind", "proposal")
    .eq("acknowledged", false)
    .maybeSingle();
  if (!event) throw new Error("proposal not found, already handled, or not owned by this user");

  const payload = (event.payload as ProposalPayload | null) ?? {};
  const strategyId = payload.strategyId ?? event.strategy_id ?? undefined;
  if (!strategyId) throw new Error("proposal event has no strategyId");
  if (!payload.proposedParams || typeof payload.proposedParams !== "object") throw new Error("proposal event has no proposedParams");

  const { data: strategy } = await supabase.from("alpha_strategies").select("id, params").eq("id", strategyId).eq("user_id", userId).maybeSingle();
  if (!strategy) throw new Error("strategy not found or not owned by this user");

  const previousParams = (strategy.params as Record<string, unknown>) ?? {};
  const newParams = { ...previousParams, ...payload.proposedParams };

  await supabase.from("alpha_strategies").update({ params: newParams as never }).eq("id", strategyId).eq("user_id", userId);
  await supabase.from("alpha_events").update({ acknowledged: true }).eq("id", eventId).eq("user_id", userId);
  await supabase.from("alpha_events").insert({
    user_id: userId,
    strategy_id: strategyId,
    kind: "applied",
    payload: { sourceEventId: eventId, previousParams, newParams } as never,
  });

  return { ok: true, strategyId, newParams };
}

/** Dismisses a proposal without applying it — just marks it acknowledged, no
 *  `applied` event (nothing changed). */
export async function dismissProposal(supabase: Client, userId: string, eventId: string): Promise<void> {
  const { error } = await supabase.from("alpha_events").update({ acknowledged: true }).eq("id", eventId).eq("user_id", userId).eq("kind", "proposal");
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Per-strategy stats lookup (MCP `get_strategy_stats`) — ownership-checked
// the same way every other per-strategy function here is.
// ---------------------------------------------------------------------------

export async function getStrategyStats(supabase: Client, userId: string, filters: { strategyId: string; from?: string; to?: string }) {
  const { data: strategy } = await supabase.from("alpha_strategies").select("id").eq("id", filters.strategyId).eq("user_id", userId).maybeSingle();
  if (!strategy) throw new Error("strategy not found or not owned by this user");

  let q = supabase.from("alpha_strategy_stats").select("*").eq("strategy_id", filters.strategyId).order("day", { ascending: true });
  if (filters.from) q = q.gte("day", filters.from);
  if (filters.to) q = q.lte("day", filters.to);
  const { data } = await q;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Health (MCP `get_health`) — scheduler last-tick per cron job (proxied from
// each job's own tables, since there's no separate "last run" ledger table),
// rate budgets remaining, and a stale-data warning at 2x each job's own
// interval — cheap enough signals a real cron-monitoring table would be
// overkill for this phase.
// ---------------------------------------------------------------------------

const JOB_INTERVAL_MS: Record<string, number> = {
  "alpha-run": 60_000,
  "alpha-settle": 5 * 60_000,
  "alpha-ingest": 15 * 60_000,
  "alpha-evaluate": 24 * 60 * 60_000,
};

export interface HealthJobStatus {
  name: string;
  lastTick: string | null;
  staleAfterMs: number;
  stale: boolean;
}

export interface HealthReport {
  jobs: HealthJobStatus[];
  rateBudgets: { provider: string; remaining: number; limitPerWindow: number; windowSeconds: number; windowStart: string }[];
}

function jobStatus(name: string, lastTick: string | null, now: number): HealthJobStatus {
  const staleAfterMs = JOB_INTERVAL_MS[name] * 2;
  const stale = lastTick == null || now - new Date(lastTick).getTime() > staleAfterMs;
  return { name, lastTick, staleAfterMs, stale };
}

export async function getHealth(supabase: Client, userId: string): Promise<HealthReport> {
  const strategies = await listStrategies(supabase, userId);
  const strategyIds = strategies.map((s) => s.id);
  const now = Date.now();

  let lastRunAt: string | null = null;
  if (strategyIds.length > 0) {
    const { data } = await supabase.from("alpha_runs").select("started_at").in("strategy_id", strategyIds).order("started_at", { ascending: false }).limit(1).maybeSingle();
    lastRunAt = data?.started_at ?? null;
  }

  const { data: lastSettled } = await supabase
    .from("alpha_orders")
    .select("settled_at")
    .eq("user_id", userId)
    .not("settled_at", "is", null)
    .order("settled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Ingest data (fixtures/odds) is shared across users, not per-owner — its
  // "last tick" is whichever ingest pass most recently touched anything.
  const { data: lastFixture } = await supabase.from("alpha_fixtures").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();

  let lastEvalDay: string | null = null;
  if (strategyIds.length > 0) {
    const { data } = await supabase.from("alpha_strategy_stats").select("day").in("strategy_id", strategyIds).order("day", { ascending: false }).limit(1).maybeSingle();
    lastEvalDay = data?.day ?? null;
  }

  const { data: rateBudgetRows } = await supabase.from("alpha_rate_budget").select("*");

  return {
    jobs: [
      jobStatus("alpha-run", lastRunAt, now),
      jobStatus("alpha-settle", lastSettled?.settled_at ?? null, now),
      jobStatus("alpha-ingest", lastFixture?.updated_at ?? null, now),
      jobStatus("alpha-evaluate", lastEvalDay ? new Date(lastEvalDay).toISOString() : null, now),
    ],
    rateBudgets: (rateBudgetRows ?? []).map((r) => ({
      provider: r.provider,
      remaining: Math.max(0, r.limit_per_window - r.used),
      limitPerWindow: r.limit_per_window,
      windowSeconds: r.window_seconds,
      windowStart: r.window_start,
    })),
  };
}

// ---------------------------------------------------------------------------
// Leaderboard (Phase 1 stub — real ROI-CI/Brier/RPS/CLV land in Phase 5)
// ---------------------------------------------------------------------------

export async function getLeaderboard(supabase: Client, userId: string) {
  const strategies = await listStrategies(supabase, userId);
  if (strategies.length === 0) return [];
  const { data: stats } = await supabase
    .from("alpha_strategy_stats")
    .select("*")
    .in(
      "strategy_id",
      strategies.map((s) => s.id),
    )
    .order("day", { ascending: false });

  // Each alpha_strategy_stats row's pnl_total/n are already running totals
  // as of that day (see docs/alpha/04-schema.md) — the latest row per
  // strategy (first match, since the query is ordered day desc) is
  // "current". Real ROI-CI/Brier/RPS/CLV/Sharpe land in Phase 5; this is
  // the raw n/pnl view the UI has something to show in the meantime.
  return strategies
    .map((s) => {
      const latest = (stats ?? []).find((r) => r.strategy_id === s.id);
      return { strategyId: s.id, name: s.name, venue: s.venue, n: latest?.n ?? 0, pnlTotal: latest?.pnl_total ?? 0, budget: s.budget };
    })
    .sort((a, b) => b.pnlTotal - a.pnlTotal);
}

// ---------------------------------------------------------------------------
// Risk-gate context assembly — the aggregation runner.ts (and, from Phase 2,
// the MCP place_intent tool) needs before calling risk.evaluateIntent.
// ---------------------------------------------------------------------------

export interface RiskContext {
  killSwitch: boolean;
  venue: RiskGateVenueConfig;
  strategy: RiskGateStrategyConfig;
}

interface StrategyRow {
  id: string;
  user_id: string;
  venue: string;
  enabled: boolean;
  budget: number;
  max_stake: number;
  daily_cap: number;
  daily_loss_stop: number;
  kelly_fraction: number;
  min_edge: number;
  max_odds: number | null;
  cooldown_min: number;
}

export async function getRiskContext(supabase: Client, strategyRow: StrategyRow, now: number): Promise<RiskContext> {
  const settings = await getSettings(supabase, strategyRow.user_id);
  const venueRow = await getOrCreateVenue(supabase, strategyRow.user_id, strategyRow.venue as VenueId);

  const dayStart = dayStartIso(now);
  const { data: todaysDecisions } = await supabase
    .from("alpha_decisions")
    .select("id, stake, market_id, decided_at")
    .eq("strategy_id", strategyRow.id)
    .eq("status", "accepted")
    .gte("decided_at", dayStart);
  const spentToday = (todaysDecisions ?? []).reduce((sum, d) => sum + (d.stake ?? 0), 0);
  const acceptedIds = (todaysDecisions ?? []).map((d) => d.id);

  let pnlToday = 0;
  if (acceptedIds.length > 0) {
    const { data: settledToday } = await supabase
      .from("alpha_orders")
      .select("pnl")
      .in("decision_id", acceptedIds)
      .gte("settled_at", dayStart)
      .not("pnl", "is", null);
    pnlToday = (settledToday ?? []).reduce((sum, o) => sum + (o.pnl ?? 0), 0);
  }

  const { data: recentDecisions } = await supabase
    .from("alpha_decisions")
    .select("market_id, decided_at")
    .eq("strategy_id", strategyRow.id)
    .order("decided_at", { ascending: false })
    .limit(200);
  const lastIntentAtByMarket: Record<string, number> = {};
  for (const d of recentDecisions ?? []) {
    const ts = new Date(d.decided_at).getTime();
    if (!(d.market_id in lastIntentAtByMarket) || lastIntentAtByMarket[d.market_id] < ts) {
      lastIntentAtByMarket[d.market_id] = ts;
    }
  }

  const { data: openOrders } = await supabase
    .from("alpha_orders")
    .select("market_id, stake, status, decision_id, alpha_decisions!inner(strategy_id)")
    .eq("alpha_decisions.strategy_id", strategyRow.id)
    .in("status", ["open", "filled", "partial"]);
  const exposureByMarket: Record<string, number> = {};
  for (const o of openOrders ?? []) {
    exposureByMarket[o.market_id] = (exposureByMarket[o.market_id] ?? 0) + o.stake;
  }

  return {
    killSwitch: settings.killSwitch,
    venue: {
      enabled: venueRow.enabled,
      maxStake: venueRow.maxStake,
      dailyCap: venueRow.dailyCap,
      spentToday: venueRow.spentToday,
      dailyLossStop: venueRow.dailyLossStop,
      pnlToday: venueRow.pnlToday,
    },
    strategy: {
      id: strategyRow.id,
      enabled: strategyRow.enabled,
      budget: strategyRow.budget,
      maxStake: strategyRow.max_stake,
      dailyCap: strategyRow.daily_cap,
      spentToday,
      dailyLossStop: strategyRow.daily_loss_stop,
      pnlToday,
      kellyFraction: strategyRow.kelly_fraction,
      minEdge: strategyRow.min_edge,
      maxOdds: strategyRow.max_odds,
      cooldownMin: strategyRow.cooldown_min,
      withinScheduleWindow: true, // runner.ts only calls evaluate() for strategies it just claimed as due
      openPositionsCount: (openOrders ?? []).length,
      exposureByMarket,
      lastIntentAtByMarket,
    },
  };
}
