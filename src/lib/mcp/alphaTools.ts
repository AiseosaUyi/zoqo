import { createServiceRoleClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import { createVenueAdapter } from "@/lib/alpha/venues";
import type { VenueId } from "@/lib/alpha/core/venue";
import { createFixtureFeatureProvider } from "@/lib/alpha/features/fixtureFeatures";
import { predictFixture as runPredictFixture } from "@/lib/alpha/predictFixture";
import { buildSlip as runBuildSlip, type BuildSlipInput } from "@/lib/alpha/slip";
import type { FootballModelKey } from "@/lib/alpha/football/models";

/** ZOQO Alpha MCP tools (docs/alpha/05-mcp-spec.md) — every function here is
 *  a thin wrapper over src/lib/alpha/service.ts, registered in
 *  src/app/api/mcp/route.ts alongside the 12 pre-existing terminal tools.
 *  Same shape as src/lib/mcp/tools.ts: each function takes a userId (and
 *  args) and returns the MCP `{content:[...]}` shape directly, so route.ts
 *  can just `return alphaTools.xxx(...)`. Scope checks
 *  (`alpha:read`/`alpha:run`/`alpha:manage`/`alpha:credentials`) happen in
 *  route.ts via `requireScope`, not here — same split responsibility as
 *  `requireTrade` already has for the terminal tools. */

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorText(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Venues and data
// ---------------------------------------------------------------------------

export async function listVenues(userId: string) {
  const supabase = createServiceRoleClient();
  const venues = await service.listVenues(supabase, userId);
  return text(venues);
}

export async function setVenue(
  userId: string,
  args: { venue: string; enabled?: boolean; maxStake?: number; dailyCap?: number; dailyLossStop?: number },
) {
  const supabase = createServiceRoleClient();
  await service.setVenue(supabase, userId, { ...args, venue: args.venue as VenueId });
  return text({ ok: true });
}

export async function searchMarkets(userId: string, args: { venue: string; query?: string; category?: string; limit?: number }) {
  const supabase = createServiceRoleClient();
  try {
    const adapter = createVenueAdapter(args.venue as VenueId, supabase, userId);
    const markets = await adapter.listMarkets({ query: args.query, category: args.category, limit: args.limit });
    return text(markets);
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "search failed");
  }
}

export async function getQuoteV2(userId: string, args: { venue: string; marketId: string; outcomeId?: string }) {
  const supabase = createServiceRoleClient();
  try {
    const adapter = createVenueAdapter(args.venue as VenueId, supabase, userId);
    const quote = await adapter.getQuote({ venue: args.venue as VenueId, marketId: args.marketId, outcomeId: args.outcomeId });
    if (!quote) return errorText(`no quote available for ${args.venue}/${args.marketId}`);
    return text(quote);
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "quote failed");
  }
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export async function listStrategyTemplates() {
  return text(service.listStrategyTemplates());
}

export async function listStrategies(userId: string) {
  const supabase = createServiceRoleClient();
  return text(await service.listStrategies(supabase, userId));
}

export async function createStrategy(userId: string, input: service.CreateStrategyInput) {
  const supabase = createServiceRoleClient();
  try {
    const strategy = await service.createStrategy(supabase, userId, input);
    return text(strategy);
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "create failed");
  }
}

export async function updateStrategy(userId: string, id: string, patch: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  try {
    await service.updateStrategy(supabase, userId, id, patch);
    return text({ ok: true });
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "update failed");
  }
}

export async function pauseStrategy(userId: string, id: string, reason?: string) {
  const supabase = createServiceRoleClient();
  await service.pauseStrategy(supabase, userId, id, reason);
  return text({ ok: true });
}

export async function resumeStrategy(userId: string, id: string) {
  const supabase = createServiceRoleClient();
  await service.resumeStrategy(supabase, userId, id);
  return text({ ok: true });
}

/** `run_strategy_now` per docs/alpha/05-mcp-spec.md sets next_run_at=now()
 *  and "polls up to 60s or returns {queued:true}" — this environment's
 *  runner is invoked by pg_cron, not by this MCP call directly, so there is
 *  no in-process runner to poll synchronously here. Returns `{queued:true}`
 *  immediately rather than a fake poll loop that can't actually observe a
 *  separate cron invocation completing. */
export async function runStrategyNow(userId: string, id: string) {
  const supabase = createServiceRoleClient();
  try {
    await service.runStrategyNow(supabase, userId, id);
    return text({ queued: true });
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "run failed");
  }
}

// ---------------------------------------------------------------------------
// Football (docs/alpha/05-mcp-spec.md's football section)
// ---------------------------------------------------------------------------

export async function listFixtures(args: { league?: string; from?: string; to?: string; status?: string; limit?: number }) {
  const supabase = createServiceRoleClient();
  let q = supabase.from("alpha_fixtures").select("*").order("kickoff_at", { ascending: true });
  if (args.league) q = q.eq("league_id", args.league);
  if (args.from) q = q.gte("kickoff_at", args.from);
  if (args.to) q = q.lte("kickoff_at", args.to);
  if (args.status) q = q.eq("status", args.status);
  const { data } = await q.limit(args.limit ?? 100);
  return text(data ?? []);
}

export async function getFixture(fixtureId: string) {
  const supabase = createServiceRoleClient();
  const { data: fixture } = await supabase.from("alpha_fixtures").select("*").eq("id", fixtureId).maybeSingle();
  if (!fixture) return errorText(`fixture ${fixtureId} not found`);
  const { data: odds } = await supabase
    .from("alpha_odds_snapshots")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("ts", { ascending: false })
    .limit(200);
  return text({ fixture, odds: odds ?? [] });
}

export async function getFixtureFeatures(fixtureId: string) {
  const supabase = createServiceRoleClient();
  const provider = createFixtureFeatureProvider(supabase, Date.now());
  const features = await provider.getFixtureFeatures!(fixtureId);
  if (!features) return errorText(`no computable features for fixture ${fixtureId} (fixture may not exist, or has no odds/ratings data yet)`);
  return text(features);
}

export async function predictFixture(args: { fixtureId: string; model?: string }) {
  const supabase = createServiceRoleClient();
  const model = (args.model ?? "blend") as FootballModelKey;
  const result = await runPredictFixture(supabase, args.fixtureId, model);
  if (!result) return errorText(`fixture ${args.fixtureId} not found, or model "${model}" has no data to run on`);
  return text(result);
}

export async function getOddsHistory(args: { fixtureId: string; book?: string; market?: string; limit?: number }) {
  const supabase = createServiceRoleClient();
  let q = supabase.from("alpha_odds_snapshots").select("*").eq("fixture_id", args.fixtureId).order("ts", { ascending: true });
  if (args.book) q = q.eq("book", args.book);
  if (args.market) q = q.eq("market", args.market);
  const { data } = await q.limit(args.limit ?? 500);
  return text(data ?? []);
}

export async function buildSlip(userId: string, input: BuildSlipInput) {
  const supabase = createServiceRoleClient();
  const result = await runBuildSlip(supabase, userId, input);
  if ("error" in result) return errorText(result.error);
  return text(result);
}

// ---------------------------------------------------------------------------
// Orders and decisions
// ---------------------------------------------------------------------------

export async function listDecisions(
  userId: string,
  filters: { strategyId?: string; venue?: string; status?: "accepted" | "rejected"; limit?: number },
) {
  const supabase = createServiceRoleClient();
  return text(await service.listDecisions(supabase, userId, filters));
}

// ---------------------------------------------------------------------------
// Learning and control
// ---------------------------------------------------------------------------

export async function getLeaderboard(userId: string) {
  const supabase = createServiceRoleClient();
  return text(await service.getLeaderboard(supabase, userId));
}

export async function killSwitch(userId: string, on: boolean, reason?: string) {
  const supabase = createServiceRoleClient();
  await service.setKillSwitch(supabase, userId, on, reason);
  return text({ ok: true, killSwitch: on });
}

// ---------------------------------------------------------------------------
// Phase 5: proposals, per-strategy stats, and scheduler health
// (docs/alpha/05-mcp-spec.md) — same thin-wrapper-over-service.ts shape as
// every tool above.
// ---------------------------------------------------------------------------

export async function listProposals(userId: string) {
  const supabase = createServiceRoleClient();
  return text(await service.listProposals(supabase, userId));
}

export async function applyProposal(userId: string, eventId: string) {
  const supabase = createServiceRoleClient();
  try {
    return text(await service.applyProposal(supabase, userId, eventId));
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "apply failed");
  }
}

export async function getStrategyStats(userId: string, args: { strategyId: string; from?: string; to?: string }) {
  const supabase = createServiceRoleClient();
  try {
    return text(await service.getStrategyStats(supabase, userId, args));
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "lookup failed");
  }
}

export async function getHealth(userId: string) {
  const supabase = createServiceRoleClient();
  return text(await service.getHealth(supabase, userId));
}

// ---------------------------------------------------------------------------
// Phase 7 finish (docs/alpha/PROMPT-alpha-finish.md §2) — the 13 remaining
// spec tools, same thin-wrapper-over-service.ts shape as every tool above.
// ---------------------------------------------------------------------------

export async function getBalances(userId: string) {
  const supabase = createServiceRoleClient();
  return text(await service.getBalances(supabase, userId));
}

export async function setVenueCredentials(userId: string, args: { venue: string; secret: string; scope?: "read" | "trade" }) {
  const supabase = createServiceRoleClient();
  if (!(service.CREDENTIAL_VENUES as readonly string[]).includes(args.venue)) {
    return errorText(`venue must be one of ${service.CREDENTIAL_VENUES.join(", ")}`);
  }
  try {
    return text(await service.setVenueCredentials(supabase, userId, { venue: args.venue as service.CredentialVenue, secret: args.secret, scope: args.scope }));
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "failed to store credential");
  }
}

export async function backtestStrategy(args: { strategyKey: string; venue: string; from: string; to: string; params?: Record<string, unknown> }) {
  const supabase = createServiceRoleClient();
  try {
    return text(await service.backtestStrategy(supabase, args));
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "backtest failed");
  }
}

export async function getRuns(userId: string, args: { strategyId?: string; limit?: number }) {
  const supabase = createServiceRoleClient();
  return text(await service.getRuns(supabase, userId, args));
}

export async function getRun(userId: string, runId: string) {
  const supabase = createServiceRoleClient();
  const run = await service.getRun(supabase, userId, runId);
  if (!run) return errorText(`run ${runId} not found or not owned by this user`);
  return text(run);
}

export async function listOrders(userId: string, args: { venue?: string; status?: string; since?: string; limit?: number }) {
  const supabase = createServiceRoleClient();
  return text(await service.listOrders(supabase, userId, args));
}

export async function placeIntent(userId: string, args: service.PlaceIntentInput) {
  const supabase = createServiceRoleClient();
  try {
    return text(await service.placeIntent(supabase, userId, args));
  } catch (err) {
    return errorText(err instanceof Error ? err.message : "place_intent failed");
  }
}

export async function cancelOrder(userId: string, orderId: string) {
  const supabase = createServiceRoleClient();
  const result = await service.cancelOrder(supabase, userId, orderId);
  if (!result.ok) return errorText(result.error);
  return text(result);
}

export async function settleNow(userId: string, venue?: string) {
  const supabase = createServiceRoleClient();
  return text(await service.settleNow(supabase, userId, venue as never));
}

export async function getSettings(userId: string) {
  const supabase = createServiceRoleClient();
  return text(await service.getSettings(supabase, userId));
}

export async function setSettings(userId: string, patch: { leagues?: string[]; baseCurrency?: string }) {
  const supabase = createServiceRoleClient();
  await service.setSettings(supabase, userId, patch);
  return text({ ok: true });
}

export async function getEvents(userId: string, args: { since?: string; kinds?: string[]; limit?: number }) {
  const supabase = createServiceRoleClient();
  return text(await service.listEvents(supabase, userId, { since: args.since, kinds: args.kinds, limit: args.limit }));
}

export async function ackEvent(userId: string, id: string) {
  const supabase = createServiceRoleClient();
  await service.ackEvent(supabase, userId, id);
  return text({ ok: true });
}
