import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { VenueId, VenueAdapter, Intent, PlacedOrder } from "./core/venue";
import type { RiskGateStrategyConfig, RiskGateVenueConfig } from "./risk";
import { evaluateIntent } from "./risk";
import { runSourceScreen } from "./copy/sources";
import { detectPolymarketFills, detectManifoldFills, discoverPolymarketCandidates, discoverManifoldCandidates } from "./copy/follow";
import { computeCopyGap, type CopyDecisionOutcome } from "./copy/gap";
import { listStrategyTemplates as registryTemplates, getStrategyTemplate } from "./strategies";
import { getCredentialStatus, type CredentialStatus } from "./setupStatus";
import { createVenueAdapter } from "./venues";
import { runFootballBacktest, type BacktestFixtureInput, type FootballBacktestOptions } from "./backtest";

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

/** Alpha never trades real money — `VenueMode` keeps `"live"` as a type
 *  member only so Intent/order plumbing type-checks against a real venue
 *  SDK's own mode field (see core/venue.ts's header), but no adapter
 *  constructor is ever built with it and the `alpha_venues.mode` check
 *  constraint physically disallows storing it. This is the runtime
 *  backstop for "should never happen" (docs/alpha/PROMPT-alpha-finish.md
 *  §7): every venue row this module reads and every adapter it constructs
 *  passes through here first, so a corrupted row or a future adapter
 *  mistake fails loudly instead of silently placing a real-money order. */
export function assertVenueModeNotLive(mode: string, context: string): void {
  if (mode === "live") {
    throw new Error(`refusing "live" venue mode (${context}) — Alpha only ever trades paper/demo, see docs/alpha/03-architecture.md's non-goals`);
  }
}

/** Every `createVenueAdapter` call in this program should go through this
 *  wrapper, not the raw factory, so the live-mode assertion above is an
 *  actual chokepoint (runner.ts and settle.ts import this instead of
 *  `./venues` directly) rather than only guarding this file's own 3
 *  call sites. */
export function getVenueAdapter(venue: VenueId, supabase: Client, userId: string): VenueAdapter {
  const adapter = createVenueAdapter(venue, supabase, userId);
  assertVenueModeNotLive(adapter.mode, `adapter for venue "${venue}"`);
  return adapter;
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
  assertVenueModeNotLive(row.mode, `alpha_venues row for venue "${row.venue}"`);
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

export async function listEvents(
  supabase: Client,
  userId: string,
  filters: { since?: string; limit?: number; kinds?: string[]; unacknowledgedOnly?: boolean } = {},
) {
  let q = supabase.from("alpha_events").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (filters.since) q = q.gte("created_at", filters.since);
  if (filters.kinds && filters.kinds.length > 0) q = q.in("kind", filters.kinds);
  if (filters.unacknowledgedOnly) q = q.eq("acknowledged", false);
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
  credentials: CredentialStatus[];
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
    credentials: getCredentialStatus(),
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

// ---------------------------------------------------------------------------
// Intent execution — the one place risk.ts's evaluateIntent, alpha_decisions,
// alpha_orders, and recordVenueSpend meet. runner.ts's runOneStrategy calls
// this per intent for a scheduled strategy run; placeIntent (below) calls
// the exact same function for an MCP-driven `place_intent` call — one
// execution path for both doors, per docs/alpha/03-architecture.md §10
// ("no logic in route handlers") and §5's "agent-driven orders are not
// exempt" (docs/alpha/05-mcp-spec.md's place_intent entry).
// ---------------------------------------------------------------------------

export interface ExecuteIntentOutcome {
  decision: Record<string, unknown> | null;
  accepted: boolean;
  reason?: string;
  order?: PlacedOrder;
}

export async function executeIntent(
  supabase: Client,
  userId: string,
  venue: VenueId,
  venueAdapter: { currency: PlacedOrder["currency"]; place: (intent: Intent, stake: number, ctx: { userId: string; now: number }) => Promise<PlacedOrder> },
  intent: Intent,
  riskCtx: RiskContext,
  now: number,
  runId: string | null = null,
  onPlaceError?: (message: string) => void,
): Promise<ExecuteIntentOutcome> {
  const decimalOddsForSizing = intent.marketProb && intent.marketProb > 0 && intent.marketProb < 1 ? 1 / intent.marketProb : undefined;

  const result = evaluateIntent({
    intent,
    now,
    killSwitch: riskCtx.killSwitch,
    strategy: riskCtx.strategy,
    venue: riskCtx.venue,
    decimalOddsForSizing,
  });

  const { data: decision } = await supabase
    .from("alpha_decisions")
    .insert({
      user_id: userId,
      strategy_id: intent.strategyId,
      run_id: runId,
      venue,
      market_id: intent.market.marketId,
      outcome_id: intent.market.outcomeId ?? null,
      side: intent.side,
      status: result.accepted ? "accepted" : "rejected",
      reject_reason: result.accepted ? null : result.reason,
      edge: intent.edge,
      model_prob: intent.modelProb ?? null,
      market_prob: intent.marketProb ?? null,
      price_or_odds: decimalOddsForSizing ?? null,
      stake: result.accepted ? result.stake : null,
      currency: venueAdapter.currency,
      rationale: intent.rationale,
      features: (intent.features ?? null) as never,
      source_id: intent.copyMeta?.sourceId ?? null,
      lag_ms: intent.copyMeta?.lagMs ?? null,
      slippage_bps: intent.copyMeta?.slippageBps ?? null,
    })
    .select("*")
    .single();

  if (!result.accepted || !decision) {
    return { decision: decision ?? null, accepted: false, reason: result.accepted ? "failed to record decision" : result.reason };
  }

  let placed: PlacedOrder;
  try {
    placed = await venueAdapter.place(intent, result.stake, { userId, now });
  } catch (e) {
    const message = (e as Error).message;
    onPlaceError?.(message);
    return { decision, accepted: false, reason: `place() threw: ${message}` };
  }
  if (placed.status === "rejected" || !placed.venueOrderId) {
    return { decision, accepted: false, reason: "venue rejected the order" };
  }

  await supabase.from("alpha_orders").insert({
    decision_id: decision.id,
    user_id: userId,
    venue,
    venue_order_id: placed.venueOrderId,
    market_id: intent.market.marketId,
    outcome_id: intent.market.outcomeId ?? null,
    side: placed.side,
    kind: intent.kind,
    stake: placed.stake,
    currency: placed.currency,
    price_or_odds: placed.priceOrOdds,
    status: placed.status,
  });
  await recordVenueSpend(supabase, userId, venue, placed.stake);

  return { decision, accepted: true, order: placed };
}

/** One synthetic `alpha_strategies` row per (user, venue) that MCP's
 *  `place_intent` sizes and rate-limits against — an ad hoc order still
 *  needs *some* `RiskGateStrategyConfig` (budget/caps/cooldown/exposure
 *  tracking) to run through the same gate a real strategy uses. Deliberately
 *  NOT in the strategy registry (`strategy_key` matches nothing
 *  `getStrategyTemplate` resolves) and `next_run_at` is pinned to the far
 *  future, so `runner.ts`'s `runDueStrategies` can never pick this row up —
 *  it exists purely as a risk-gate config holder, never actually "runs". */
const MANUAL_STRATEGY_KEY = "mcp-manual-intent";
const MANUAL_STRATEGY_FAR_FUTURE = "2100-01-01T00:00:00.000Z";
const MANUAL_STRATEGY_DEFAULTS = { budget: 1000, maxStake: 250, dailyCap: 1000, dailyLossStop: 500 };

export async function getOrCreateManualStrategy(supabase: Client, userId: string, venue: VenueId) {
  const id = `${MANUAL_STRATEGY_KEY}:${userId}:${venue}`;
  const { data: existing } = await supabase.from("alpha_strategies").select("*").eq("id", id).maybeSingle();
  if (existing) return existing;

  const { data: inserted, error } = await supabase
    .from("alpha_strategies")
    .insert({
      id,
      user_id: userId,
      strategy_key: MANUAL_STRATEGY_KEY,
      name: `MCP manual intents (${venue})`,
      venue,
      enabled: true, // risk.ts's strategy_enabled check reads this verbatim — must be true for place_intent to ever pass the gate
      params: {},
      schedule: { kind: "event", on: "mcp-place-intent" },
      budget: MANUAL_STRATEGY_DEFAULTS.budget,
      max_stake: MANUAL_STRATEGY_DEFAULTS.maxStake,
      daily_cap: MANUAL_STRATEGY_DEFAULTS.dailyCap,
      daily_loss_stop: MANUAL_STRATEGY_DEFAULTS.dailyLossStop,
      kelly_fraction: 1, // suggestedStakePct already carries the caller's intended stake fraction — no further Kelly shrinkage
      min_edge: -1, // place_intent's side is caller-chosen, not model-derived; edge is always 0 and must never fail this check
      max_odds: null,
      cooldown_min: 0,
      next_run_at: MANUAL_STRATEGY_FAR_FUTURE,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return inserted;
}

export interface PlaceIntentInput {
  venue: string;
  marketId: string;
  outcomeId?: string;
  side: Intent["side"];
  kind: "market" | "limit";
  limitPrice?: number;
  stake?: number;
  rationale: string;
}

/** MCP `place_intent` (alpha:run, docs/alpha/05-mcp-spec.md). Builds an
 *  `Intent` from caller args and runs it through the identical
 *  `executeIntent` path a scheduled strategy's own intents take — same risk
 *  gate, same decision/order logging, no bypass for an agent-driven order.
 *  One deliberate addition on top of the shared gate: because the caller
 *  named an exact `stake`, silently downsizing it (evaluateIntent's normal
 *  clamp-to-cap behavior) would place a different bet than the one asked
 *  for without saying so — safer to reject outright and log why than to
 *  silently resize someone's explicit order. */
/** Pure predicate behind `placeIntent`'s explicit-stake pre-check — exported
 *  and unit-tested on its own (no Supabase needed), same "extract the
 *  decision logic, test it without I/O" discipline as `risk.ts`'s
 *  `evaluateIntent`. `undefined`/no requested stake never exceeds anything
 *  (sizing falls through to the normal risk gate in that case). */
export function exceedsRequestedStake(requestedStake: number | undefined, strategyMaxStake: number, venueMaxStake: number): boolean {
  if (requestedStake == null) return false;
  return requestedStake > Math.min(strategyMaxStake, venueMaxStake);
}

export async function placeIntent(supabase: Client, userId: string, input: PlaceIntentInput): Promise<ExecuteIntentOutcome> {
  const venue = input.venue as VenueId;
  const venueAdapter = getVenueAdapter(venue, supabase, userId);
  const manualStrategy = await getOrCreateManualStrategy(supabase, userId, venue);
  const now = Date.now();
  const riskCtx = await getRiskContext(supabase, manualStrategy, now);

  if (exceedsRequestedStake(input.stake, riskCtx.strategy.maxStake, riskCtx.venue.maxStake)) {
    const { data: decision } = await supabase
      .from("alpha_decisions")
      .insert({
        user_id: userId,
        strategy_id: manualStrategy.id,
        run_id: null,
        venue,
        market_id: input.marketId,
        outcome_id: input.outcomeId ?? null,
        side: input.side,
        status: "rejected",
        reject_reason: "stake_exceeds_max_stake",
        edge: 0,
        rationale: input.rationale,
      })
      .select("*")
      .single();
    return { decision: decision ?? null, accepted: false, reason: "stake_exceeds_max_stake" };
  }

  const intent: Intent = {
    strategyId: manualStrategy.id,
    market: { venue, marketId: input.marketId, outcomeId: input.outcomeId },
    side: input.side,
    kind: input.kind,
    limitPrice: input.limitPrice,
    edge: 0,
    suggestedStakePct: input.stake != null ? input.stake / manualStrategy.budget : 1,
    rationale: input.rationale,
  };

  return executeIntent(supabase, userId, venue, venueAdapter, intent, riskCtx, now, null);
}

/** MCP `cancel_order` (alpha:run). Adapters without a `cancel()` method
 *  (docs/alpha/03-architecture.md §2's `cancel?` is optional — most venues
 *  here are paper/simulated with nothing resting to cancel) return a clear,
 *  typed error rather than a throw. */
export async function cancelOrder(supabase: Client, userId: string, orderId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: order } = await supabase.from("alpha_orders").select("*").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (!order) return { ok: false, error: "order not found or not owned by this user" };

  const adapter = getVenueAdapter(order.venue as VenueId, supabase, userId);
  if (!adapter.cancel) return { ok: false, error: `${order.venue} does not support cancelling an order` };

  try {
    await adapter.cancel(order.venue_order_id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  await supabase.from("alpha_orders").update({ status: "cancelled" }).eq("id", orderId);
  return { ok: true };
}

/** MCP `settle_now` (alpha:run) — forces a settlement pass for this user,
 *  optionally scoped to one venue. Reuses `settleOpenOrders`'s per-(user,
 *  venue) adapter grouping via an optional filter rather than duplicating
 *  that grouping logic here. */
export async function settleNow(supabase: Client, userId: string, venue?: VenueId) {
  const { settleOpenOrders } = await import("./settle");
  return settleOpenOrders(supabase, { userId, venue });
}

/** MCP `list_orders` (alpha:read). */
export async function listOrders(
  supabase: Client,
  userId: string,
  filters: { venue?: string; status?: string; since?: string; limit?: number } = {},
) {
  let q = supabase.from("alpha_orders").select("*").eq("user_id", userId).order("placed_at", { ascending: false });
  if (filters.venue) q = q.eq("venue", filters.venue);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.since) q = q.gte("placed_at", filters.since);
  const { data } = await q.limit(filters.limit ?? 50);
  return data ?? [];
}

/** MCP `get_runs`/`get_run` (alpha:read). `alpha_runs` has no `user_id`
 *  column (it belongs to a strategy, which belongs to a user) so ownership
 *  is checked via an inner join on `alpha_strategies.user_id` — the same
 *  belt-and-braces pattern `applyProposal` uses for a JSONB-sourced
 *  strategy id, applied here to a join instead. */
export async function getRuns(supabase: Client, userId: string, filters: { strategyId?: string; limit?: number } = {}) {
  let q = supabase
    .from("alpha_runs")
    .select("*, alpha_strategies!inner(user_id)")
    .eq("alpha_strategies.user_id", userId)
    .order("started_at", { ascending: false });
  if (filters.strategyId) q = q.eq("strategy_id", filters.strategyId);
  const { data } = await q.limit(filters.limit ?? 25);
  // The `alpha_strategies` key is the ownership-check join, not run data —
  // strip it so callers see a plain alpha_runs row, not a nested join shape.
  return (data ?? []).map((row) => {
    const run = { ...row } as Partial<typeof row>;
    delete run.alpha_strategies;
    return run;
  });
}

export async function getRun(supabase: Client, userId: string, runId: string) {
  const { data } = await supabase
    .from("alpha_runs")
    .select("*, alpha_strategies!inner(user_id)")
    .eq("id", runId)
    .eq("alpha_strategies.user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const run = { ...data } as Partial<typeof data>;
  delete run.alpha_strategies;
  return run;
}

/** MCP `get_balances` (alpha:read) — every venue the user has a row for,
 *  plus the terminal wallet (already covered by `zoqo-terminal`'s own
 *  adapter, so no separate wallet lookup needed). Venues whose adapter
 *  throws (no credential, e.g. Manifold with no `MANIFOLD_API_KEY`) report
 *  `available: false` with the reason rather than failing the whole call —
 *  one missing key shouldn't hide every other venue's balance. */
export async function getBalances(supabase: Client, userId: string) {
  const venues = await listVenues(supabase, userId);
  return Promise.all(
    venues.map(async (v) => {
      try {
        const adapter = getVenueAdapter(v.venue, supabase, userId);
        const balance = await adapter.balance();
        return { venue: v.venue, available: true as const, ...balance };
      } catch (e) {
        return { venue: v.venue, available: false as const, error: (e as Error).message };
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Venue credentials (docs/alpha/03-architecture.md §3) — shared by the
// `/api/alpha/credentials` UI route and MCP's `set_venue_credentials`.
// Section 3 (Supabase Vault) replaces this function's body with a real
// `vault.create_secret` round trip; callers don't change.
// ---------------------------------------------------------------------------

export const CREDENTIAL_VENUES = ["manifold", "kalshi-demo", "bybit-demo", "deriv-virtual"] as const;
export type CredentialVenue = (typeof CREDENTIAL_VENUES)[number];

export async function listCredentials(supabase: Client, userId: string) {
  const { data } = await supabase.from("broker_credentials").select("broker, scope, created_at").eq("user_id", userId).order("created_at", { ascending: false });
  return data ?? [];
}

/** Stores (or rotates) a venue's credential. Returns only a non-reversible
 *  prefix — the raw secret is read once, used to compute that prefix, and
 *  otherwise never persisted, logged, or echoed back in full. See
 *  `secrets.ts` for the read side. */
export async function setVenueCredentials(
  supabase: Client,
  userId: string,
  input: { venue: CredentialVenue; secret: string; scope?: "read" | "trade" },
): Promise<{ ok: true; venue: CredentialVenue; scope: string; keyPrefix: string }> {
  const secret = input.secret.trim();
  if (!secret || secret.length > 500) throw new Error("secret is required (max 500 chars)");
  const scope = input.scope === "read" ? "read" : "trade";
  const prefix = `${secret.slice(0, 4)}${"•".repeat(Math.max(0, secret.length - 4))}`;

  // Real Vault write (supabase/migrations/20260914010000_alpha_vault_secrets.sql's
  // alpha_store_secret) is attempted first; if the function doesn't exist yet
  // (migration not applied in this Postgres — see docs/alpha/STATUS.md, no
  // SUPABASE_ACCESS_TOKEN/DB credential to run `supabase db push` from this
  // environment) this falls back to the same opaque `vault:pending:<uuid>`
  // placeholder Phase 4 shipped, so nothing else in the codebase needs to
  // change the moment the migration lands live. `secretRef` is never logged.
  const vaultName = `alpha:${userId}:${input.venue}`;
  let secretRef = `vault:pending:${crypto.randomUUID()}`;
  const { data: vaultId, error: vaultError } = await supabase.rpc("alpha_store_secret", { name: vaultName, secret });
  if (!vaultError && vaultId) secretRef = `vault:${vaultId}`;

  const { data: existing } = await supabase.from("broker_credentials").select("id").eq("user_id", userId).eq("broker", input.venue).maybeSingle();
  if (existing) {
    const { error } = await supabase.from("broker_credentials").update({ scope, secret_ref: secretRef }).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("broker_credentials").insert({ user_id: userId, broker: input.venue, scope, secret_ref: secretRef });
    if (error) throw new Error(error.message);
  }
  return { ok: true, venue: input.venue, scope, keyPrefix: prefix };
}

/** MCP `backtest_strategy` (alpha:run). Only football strategies have a
 *  real backtest engine (`backtest.ts`'s walk-forward Dixon-Coles/ELO/blend
 *  models against logged fixtures+odds, per docs/alpha/07-build-plan.md
 *  Phase 3) — every other venue's "backtest" would mean replaying quote
 *  history no adapter here persists yet, so this returns a clear
 *  unsupported error for those rather than fabricating a result. */
interface OddsSnapshotLike {
  market: string;
  outcome: string;
  decimal_odds: number;
  ts: string;
}

/** Latest 1x2 snapshot per outcome at-or-before kickoff, across every book —
 *  the "last snapshot before kickoff = closing line" convention from
 *  docs/alpha/03-architecture.md §8. Not a cross-book consensus average
 *  (deliberately simple for a backtest report, not a live pricing model);
 *  returns null if any of the three outcomes never got a pre-kickoff quote,
 *  so the caller skips the fixture rather than fabricating a line. */
function closingOneXTwo(snapshots: OddsSnapshotLike[], kickoffAt: string): { home: number; draw: number; away: number } | null {
  const kickoffMs = new Date(kickoffAt).getTime();
  const latest: Partial<Record<"home" | "draw" | "away", { odds: number; ts: number }>> = {};
  for (const s of snapshots) {
    if (s.market !== "1x2" || (s.outcome !== "home" && s.outcome !== "draw" && s.outcome !== "away")) continue;
    const ts = new Date(s.ts).getTime();
    if (ts > kickoffMs) continue;
    const cur = latest[s.outcome];
    if (!cur || ts > cur.ts) latest[s.outcome] = { odds: s.decimal_odds, ts };
  }
  if (!latest.home || !latest.draw || !latest.away) return null;
  return { home: latest.home.odds, draw: latest.draw.odds, away: latest.away.odds };
}

export async function backtestStrategy(
  supabase: Client,
  input: { strategyKey: string; venue: string; from: string; to: string; params?: Record<string, unknown> },
) {
  if (input.venue !== "zoqo-sportsbook") {
    throw new Error(`backtest_strategy only supports the zoqo-sportsbook venue's football strategies right now (got "${input.venue}")`);
  }
  const template = getStrategyTemplate(input.strategyKey);
  if (!template) throw new Error(`unknown strategy_key "${input.strategyKey}"`);

  const { data: fixtures } = await supabase
    .from("alpha_fixtures")
    .select("*, alpha_odds_snapshots(*)")
    .gte("kickoff_at", input.from)
    .lte("kickoff_at", input.to)
    .eq("status", "FT")
    .order("kickoff_at", { ascending: true });
  if (!fixtures || fixtures.length === 0) {
    return { strategyKey: input.strategyKey, venue: input.venue, from: input.from, to: input.to, fixturesFound: 0, result: null, note: "no settled fixtures in this date range yet" };
  }

  const now = Date.now();
  const backtestInput: BacktestFixtureInput[] = [];
  for (const f of fixtures) {
    if (f.home_goals == null || f.away_goals == null) continue; // FT status but score not recorded — skip rather than fabricate
    const closingOdds = closingOneXTwo((f.alpha_odds_snapshots ?? []) as OddsSnapshotLike[], f.kickoff_at);
    if (!closingOdds) continue; // no computable pre-kickoff 1x2 line for this fixture
    backtestInput.push({
      fixtureId: f.id,
      date: f.kickoff_at,
      daysAgo: Math.max(0, Math.round((now - new Date(f.kickoff_at).getTime()) / 86_400_000)),
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      homeGoals: f.home_goals,
      awayGoals: f.away_goals,
      closingOdds,
    });
  }
  if (backtestInput.length === 0) {
    return { strategyKey: input.strategyKey, venue: input.venue, from: input.from, to: input.to, fixturesFound: fixtures.length, result: null, note: "fixtures found but none had a computable closing 1x2 line" };
  }

  const result = runFootballBacktest(backtestInput, input.params as FootballBacktestOptions | undefined);
  return { strategyKey: input.strategyKey, venue: input.venue, from: input.from, to: input.to, fixturesFound: backtestInput.length, result };
}

// ---------------------------------------------------------------------------
// Copy trading (docs/alpha/08-copy-trading.md) — service.ts wrappers over
// copy/sources.ts's pure screen and copy/follow.ts's real detection
// functions. Same "one function, three doors" shape as everything else:
// the MCP tools and the nightly evaluator both call these, never a route
// handler containing the logic itself.
// ---------------------------------------------------------------------------

const COPY_VENUES = ["polymarket-sim", "manifold"] as const;
type CopyVenue = (typeof COPY_VENUES)[number];

function isCopyVenue(v: string): v is CopyVenue {
  return (COPY_VENUES as readonly string[]).includes(v);
}

export async function listCopySources(supabase: Client, userId: string, filters: { venue?: string; status?: string } = {}) {
  let q = supabase.from("alpha_copy_sources").select("*").eq("user_id", userId).order("score", { ascending: false, nullsFirst: false });
  if (filters.venue) q = q.eq("venue", filters.venue);
  if (filters.status) q = q.eq("status", filters.status);
  const { data } = await q;
  return data ?? [];
}

export async function getCopySource(supabase: Client, userId: string, id: string) {
  const { data: source } = await supabase.from("alpha_copy_sources").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!source) return null;
  const { data: fills } = await supabase.from("alpha_source_fills").select("*").eq("source_id", id).order("filled_at", { ascending: false }).limit(50);
  const { data: copies } = await supabase.from("alpha_decisions").select("*").eq("source_id", id).eq("user_id", userId).order("decided_at", { ascending: false }).limit(50);
  return { source, fills: fills ?? [], copies: copies ?? [] };
}

/** MCP `propose_copy_sources` (alpha:run). Discovers candidates for a venue
 *  (real Polymarket leaderboard; Manifold has no such public endpoint — see
 *  `copy/follow.ts`'s `discoverManifoldCandidates`, so `candidateRefs` is
 *  the real path there: name a known username explicitly), fetches each
 *  candidate's real fill history, and runs the pure screen
 *  (`copy/sources.ts`'s `scoreSource`/`runSourceScreen`), upserting
 *  `alpha_copy_sources`. Fills fetched this way are logged as *unresolved*
 *  (no resolution-linking to the venue's settlement feed is implemented
 *  yet — a real gap, not hidden: it means the skill-based score components
 *  (Brier/CLV/profit-factor/consistency) under-score every real candidate
 *  until that's built; `copyability` and history-length still work today). */
export async function proposeCopySources(supabase: Client, userId: string, venue: string, candidateRefs?: string[]): Promise<{ sourceRef: string; score: number; followable: boolean }[]> {
  if (!isCopyVenue(venue)) throw new Error(`propose_copy_sources only supports ${COPY_VENUES.join(", ")}`);

  const refs = candidateRefs && candidateRefs.length > 0 ? candidateRefs : venue === "polymarket-sim" ? await discoverPolymarketCandidates() : await discoverManifoldCandidates();
  if (refs.length === 0) return [];

  const fetchFillsForSource = async (sourceRef: string) => {
    const raw = venue === "polymarket-sim" ? await detectPolymarketFills(sourceRef, 0, 500) : await detectManifoldFills(sourceRef, 0, 500);
    return raw.map((f) => ({ filledAt: f.filledAtMs, marketId: f.marketId, side: f.side, priceAtEntry: f.price, sizeUsd: f.sizeUsd, resolved: false }));
  };

  return runSourceScreen(supabase, userId, venue, refs, fetchFillsForSource);
}

/** MCP `set_copy_source_status` (alpha:manage) — the one human-confirmation
 *  step §2 requires ("selecting is a proposal the human confirms the first
 *  time"). Stamps `followed_since`/`dropped_at` so the UI/leaderboard can
 *  show how long a source has actually been followed. */
export async function setCopySourceStatus(supabase: Client, userId: string, id: string, status: "candidate" | "followed" | "dropped" | "blocked"): Promise<void> {
  const now = new Date().toISOString();
  const patch: Database["public"]["Tables"]["alpha_copy_sources"]["Update"] = {
    status,
    ...(status === "followed" ? { followed_since: now } : {}),
    ...(status === "dropped" || status === "blocked" ? { dropped_at: now } : {}),
  };
  const { error } = await supabase.from("alpha_copy_sources").update(patch).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** MCP `get_copy_gap` (alpha:read, docs/alpha/08-copy-trading.md §4/§8) —
 *  source return vs our return on the same copied trades, our CLV vs a
 *  source-CLV proxy, and the lag distribution. "Source return" has no
 *  separate ledger of the source's own realized pnl in this schema, so
 *  it's approximated from the same resolution-vs-entry-price proxy
 *  `copy/sources.ts`'s `scoreSource` uses for CLV — an honest
 *  approximation, named as one, not a claim of a real source P&L feed. */
export async function getCopyGap(supabase: Client, userId: string, strategyId: string) {
  const { data: decisions } = await supabase
    .from("alpha_decisions")
    .select("*, alpha_orders(*)")
    .eq("strategy_id", strategyId)
    .eq("user_id", userId)
    .not("source_id", "is", null);

  const rows = decisions ?? [];
  const outcomes: CopyDecisionOutcome[] = [];
  for (const d of rows) {
    const orders = (d as unknown as { alpha_orders: Database["public"]["Tables"]["alpha_orders"]["Row"][] }).alpha_orders ?? [];
    const order = orders[0];
    outcomes.push({
      lagMs: d.lag_ms,
      ourReturn: order?.pnl != null && order.stake ? order.pnl / order.stake : null,
      ourClv: order?.pnl != null && order?.closing_price_or_odds != null && order?.price_or_odds ? order.closing_price_or_odds / order.price_or_odds - 1 : null,
    });
  }

  return {
    strategyId,
    ...computeCopyGap(outcomes),
    note: "sourceReturn/sourceClv need a real source-side settlement feed not yet built (see copy/gap.ts's own header) — only our own side is computed for now",
  };
}
