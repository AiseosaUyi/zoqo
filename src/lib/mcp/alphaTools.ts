import { createServiceRoleClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import { createVenueAdapter } from "@/lib/alpha/venues";
import type { VenueId } from "@/lib/alpha/core/venue";

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
