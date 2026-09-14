import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { ResourceTemplate } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { verifyApiKey } from "@/lib/mcp/auth";
import * as tools from "@/lib/mcp/tools";
import { ConditionSchema, ActionSchema } from "@/lib/mcp/tools";
import * as alphaTools from "@/lib/mcp/alphaTools";
import { createServiceRoleClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";
import { predictFixture as runPredictFixture } from "@/lib/alpha/predictFixture";

export const dynamic = "force-dynamic";

/** The Zoqo MCP server (TERMINAL_SPEC.md §7). Auth is a per-user API key
 *  (src/lib/mcp/auth.ts) carrying a `read` or `trade` scope — withMcpAuth
 *  below only gates "is this a valid key at all"; each trade-scoped tool
 *  additionally checks its own scope inside the handler
 *  (requireTrade/userId helper below), since mcp-handler's `requiredScopes`
 *  option is a single global gate and can't express "these tools need
 *  read, these need trade" within one server. Every write tool ultimately
 *  calls src/lib/server/terminalExecution.ts — the same order-execution
 *  path a human's Buy click and the cron evaluator (C2) use. */

function userIdOf(ctx: { http?: { authInfo?: { extra?: Record<string, unknown> } } }): string {
  const userId = ctx.http?.authInfo?.extra?.userId;
  if (typeof userId !== "string") throw new Error("no authenticated user on this request");
  return userId;
}

function requireTrade(ctx: { http?: { authInfo?: { scopes?: string[] } } }): string | null {
  if (!ctx.http?.authInfo?.scopes?.includes("trade")) {
    return "This API key does not have trade scope — generate a trade-scoped key in Settings to use this tool.";
  }
  return null;
}

/** Generalizes requireTrade for ZOQO Alpha's scopes (docs/alpha/05-mcp-spec.md)
 *  — every alpha_* tool checks its own required scope inside its handler,
 *  same reasoning as requireTrade's own comment: mcp-handler's
 *  `requiredScopes` is one global gate and can't express per-tool scopes
 *  within one server. */
export function requireScope(ctx: { http?: { authInfo?: { scopes?: string[] } } }, scope: string): string | null {
  if (!ctx.http?.authInfo?.scopes?.includes(scope)) {
    return `This API key does not have "${scope}" scope — issue a key with that scope in Settings to use this tool.`;
  }
  return null;
}

// 14 alpha_* tools below all need this same denial shape (vs. 4 pre-existing
// requireTrade call sites, which repeat it inline) — worth a helper here.
function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

const handler = createMcpHandler((server) => {
  server.registerTool(
    "get_account_summary",
    { title: "Get Account Summary", description: "Cash, equity, and unrealized P&L for the Terminal.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const summary = await tools.getAccountSummary(userIdOf(ctx));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.registerTool(
    "get_quote",
    { title: "Get Quote", description: "Current live price for an asset symbol (e.g. btcusd).", inputSchema: z.object({ symbol: z.string() }) },
    async ({ symbol }) => {
      const quote = await tools.getQuote(symbol);
      if (!quote) return { content: [{ type: "text", text: `No live price available for ${symbol}.` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(quote, null, 2) }] };
    },
  );

  server.registerTool(
    "get_positions",
    { title: "Get Positions", description: "Open Terminal positions.", inputSchema: z.object({}) },
    async (_args, ctx) => ({ content: [{ type: "text", text: JSON.stringify(await tools.getPositions(userIdOf(ctx)), null, 2) }] }),
  );

  server.registerTool(
    "get_open_orders",
    { title: "Get Open Orders", description: "Resting orders — always empty; the Terminal is market-orders-only.", inputSchema: z.object({}) },
    async () => ({ content: [{ type: "text", text: JSON.stringify(await tools.getOpenOrders(), null, 2) }] }),
  );

  server.registerTool(
    "get_trade_history",
    { title: "Get Trade History", description: "Closed Terminal trades, most recent first.", inputSchema: z.object({ limit: z.number().optional() }) },
    async ({ limit }, ctx) => ({ content: [{ type: "text", text: JSON.stringify(await tools.getTradeHistory(userIdOf(ctx), limit), null, 2) }] }),
  );

  server.registerTool(
    "place_order",
    {
      title: "Place Order",
      description: "Place a market order on the Terminal. Requires trade scope.",
      inputSchema: z.object({
        symbol: z.string(),
        side: z.enum(["long", "short"]),
        size: z.number().positive(),
        type: z.string(),
        stopLoss: z.number().optional(),
        takeProfit: z.number().optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireTrade(ctx);
      if (denied) return { content: [{ type: "text", text: denied }], isError: true };
      return tools.placeOrder(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "close_position",
    { title: "Close Position", description: "Close an open Terminal position at the current price. Requires trade scope.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
      const denied = requireTrade(ctx);
      if (denied) return { content: [{ type: "text", text: denied }], isError: true };
      return tools.closePosition(userIdOf(ctx), id);
    },
  );

  server.registerTool(
    "modify_order",
    {
      title: "Modify Order",
      description: "Update a position's stop-loss/take-profit. Requires trade scope.",
      inputSchema: z.object({ id: z.string(), stopLoss: z.number().optional(), takeProfit: z.number().optional() }),
    },
    async ({ id, stopLoss, takeProfit }, ctx) => {
      const denied = requireTrade(ctx);
      if (denied) return { content: [{ type: "text", text: denied }], isError: true };
      return tools.modifyOrder(userIdOf(ctx), id, { stopLoss, takeProfit });
    },
  );

  server.registerTool(
    "create_automation_trigger",
    {
      title: "Create Automation Trigger",
      description: "Create a real trading automation. Requires trade scope.",
      inputSchema: z.object({
        symbol: z.string(),
        condition: ConditionSchema,
        action: ActionSchema,
        maxSize: z.number().positive(),
        dailyCap: z.number().positive(),
      }),
    },
    async (args, ctx) => {
      const denied = requireTrade(ctx);
      if (denied) return { content: [{ type: "text", text: denied }], isError: true };
      return tools.createAutomationTrigger(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "list_automation_triggers",
    { title: "List Automation Triggers", description: "List your automations and their evaluator state.", inputSchema: z.object({}) },
    async (_args, ctx) => ({ content: [{ type: "text", text: JSON.stringify(await tools.listAutomationTriggers(userIdOf(ctx)), null, 2) }] }),
  );

  server.registerTool(
    "pause_automation_trigger",
    { title: "Pause Automation Trigger", description: "Disable an automation. Requires trade scope.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
      const denied = requireTrade(ctx);
      if (denied) return { content: [{ type: "text", text: denied }], isError: true };
      return tools.pauseAutomationTrigger(userIdOf(ctx), id);
    },
  );

  server.registerTool(
    "get_academy_progress",
    { title: "Get Academy Progress", description: "XP, streak, hearts, and completed lessons.", inputSchema: z.object({}) },
    async (_args, ctx) => ({ content: [{ type: "text", text: JSON.stringify(await tools.getAcademyProgress(userIdOf(ctx)), null, 2) }] }),
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha (docs/alpha/05-mcp-spec.md) — new scopes alpha:read/
  // alpha:run/alpha:manage/alpha:credentials, checked via requireScope
  // (generalizes requireTrade above). Every tool wraps alphaTools.ts,
  // which itself only ever calls src/lib/alpha/service.ts.
  // ---------------------------------------------------------------------

  server.registerTool(
    "list_venues",
    { title: "List Venues", description: "Alpha venues: mode, enabled, currency, caps, spent/pnl today. Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listVenues(userIdOf(ctx));
    },
  );

  server.registerTool(
    "set_venue",
    {
      title: "Set Venue",
      description: "Enable/disable an Alpha venue or edit its caps. Requires alpha:manage.",
      inputSchema: z.object({
        venue: z.string(),
        enabled: z.boolean().optional(),
        maxStake: z.number().positive().optional(),
        dailyCap: z.number().positive().optional(),
        dailyLossStop: z.number().positive().optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.setVenue(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "search_markets",
    {
      title: "Search Markets",
      description: "Search a venue's markets. Requires alpha:read.",
      inputSchema: z.object({ venue: z.string(), query: z.string().optional(), category: z.string().optional(), limit: z.number().positive().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.searchMarkets(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_quote_v2",
    {
      title: "Get Quote (Alpha)",
      description: "Current quote for a market on any Alpha venue. Requires alpha:read.",
      inputSchema: z.object({ venue: z.string(), marketId: z.string(), outcomeId: z.string().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getQuoteV2(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "list_strategy_templates",
    { title: "List Strategy Templates", description: "Registered strategy keys, venues, default params, schedule kinds. Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listStrategyTemplates();
    },
  );

  server.registerTool(
    "list_strategies",
    { title: "List Strategies", description: "Your Alpha strategy instances. Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listStrategies(userIdOf(ctx));
    },
  );

  server.registerTool(
    "create_strategy",
    {
      title: "Create Strategy",
      description: "Create a strategy instance from a registered template. Requires alpha:manage.",
      inputSchema: z.object({
        strategyKey: z.string(),
        name: z.string(),
        venue: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        schedule: z.object({ kind: z.literal("interval"), everyMin: z.number().positive() }).optional(),
        budget: z.number().positive(),
        maxStake: z.number().positive(),
        dailyCap: z.number().positive(),
        dailyLossStop: z.number().positive(),
        kellyFraction: z.number().positive().optional(),
        minEdge: z.number().optional(),
        maxOdds: z.number().positive().optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.createStrategy(userIdOf(ctx), { ...args, venue: args.venue as never });
    },
  );

  server.registerTool(
    "update_strategy",
    {
      title: "Update Strategy",
      description: "Edit a strategy instance's tunables (budget/caps/params/schedule). Requires alpha:manage.",
      inputSchema: z.object({ id: z.string(), patch: z.record(z.string(), z.unknown()) }),
    },
    async ({ id, patch }, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.updateStrategy(userIdOf(ctx), id, patch);
    },
  );

  server.registerTool(
    "pause_strategy",
    {
      title: "Pause Strategy",
      description: "Disable a strategy. Requires alpha:manage.",
      inputSchema: z.object({ id: z.string(), reason: z.string().optional() }),
    },
    async ({ id, reason }, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.pauseStrategy(userIdOf(ctx), id, reason);
    },
  );

  server.registerTool(
    "resume_strategy",
    { title: "Resume Strategy", description: "Re-enable a paused strategy. Requires alpha:manage.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.resumeStrategy(userIdOf(ctx), id);
    },
  );

  server.registerTool(
    "run_strategy_now",
    {
      title: "Run Strategy Now",
      description: "Queue an immediate run — the scheduler picks it up within a minute. Requires alpha:run.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.runStrategyNow(userIdOf(ctx), id);
    },
  );

  server.registerTool(
    "list_decisions",
    {
      title: "List Decisions",
      description: "Accepted and rejected intents, with reasons. Requires alpha:read.",
      inputSchema: z.object({
        strategyId: z.string().optional(),
        venue: z.string().optional(),
        status: z.enum(["accepted", "rejected"]).optional(),
        limit: z.number().positive().optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listDecisions(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_leaderboard",
    { title: "Get Leaderboard", description: "Strategies ranked by pnl (raw n/pnl in Phase 1; full ROI-CI/Brier/RPS/CLV land in Phase 5). Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getLeaderboard(userIdOf(ctx));
    },
  );

  server.registerTool(
    "kill_switch",
    {
      title: "Kill Switch",
      description: "Halt every Alpha runner immediately for this account. Requires alpha:manage.",
      inputSchema: z.object({ on: z.boolean(), reason: z.string().optional() }),
    },
    async ({ on, reason }, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.killSwitch(userIdOf(ctx), on, reason);
    },
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha: football (docs/alpha/05-mcp-spec.md's football section)
  // ---------------------------------------------------------------------

  server.registerTool(
    "list_fixtures",
    {
      title: "List Fixtures",
      description: "Upcoming/past football fixtures, optionally filtered by league/date range/status. Requires alpha:read.",
      inputSchema: z.object({
        league: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().positive().optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listFixtures(args);
    },
  );

  server.registerTool(
    "get_fixture",
    {
      title: "Get Fixture",
      description: "One fixture plus every odds snapshot on record for it. Requires alpha:read.",
      inputSchema: z.object({ fixtureId: z.string() }),
    },
    async ({ fixtureId }, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getFixture(fixtureId);
    },
  );

  server.registerTool(
    "get_fixture_features",
    {
      title: "Get Fixture Features",
      description: "The full pre-kickoff feature vector for a fixture (market, ELO, Dixon-Coles, form, situational). Requires alpha:read.",
      inputSchema: z.object({ fixtureId: z.string() }),
    },
    async ({ fixtureId }, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getFixtureFeatures(fixtureId);
    },
  );

  server.registerTool(
    "predict_fixture",
    {
      title: "Predict Fixture",
      description: "1X2 probabilities from a named model (market/dixon-coles/elo/blend, default blend), plus market consensus and edge per outcome. Requires alpha:read.",
      inputSchema: z.object({ fixtureId: z.string(), model: z.enum(["market", "dixon-coles", "elo", "blend"]).optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.predictFixture(args);
    },
  );

  server.registerTool(
    "get_odds_history",
    {
      title: "Get Odds History",
      description: "Odds snapshots for a fixture over time, optionally filtered by book/market. Requires alpha:read.",
      inputSchema: z.object({ fixtureId: z.string(), book: z.string().optional(), market: z.string().optional(), limit: z.number().positive().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getOddsHistory(args);
    },
  );

  const SlipSelectionSchema = z.object({
    fixtureId: z.string(),
    market: z.enum(["1x2", "ou25", "btts", "dc"]),
    outcome: z.enum(["home", "draw", "away", "over", "under", "yes", "no", "hd", "da", "ha"]),
    book: z.string().optional(),
  });

  server.registerTool(
    "build_slip",
    {
      title: "Build Slip",
      description:
        "Given selections, returns odds/implied-probs/model-probs/Kelly stakes, combined odds, and a plain-text version for a human to key into a bookmaker app. Set place:true (single selection only) to place it as a real zoqo-sportsbook paper bet. Requires alpha:run.",
      inputSchema: z.object({
        selections: z.array(SlipSelectionSchema).min(1),
        stakeTotal: z.number().positive().optional(),
        strategyId: z.string().optional(),
        place: z.boolean().optional(),
        kellyFraction: z.number().positive().optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.buildSlip(userIdOf(ctx), args);
    },
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha: Phase 5 — proposals, per-strategy stats, scheduler health
  // (docs/alpha/03-architecture.md §7 Level 4, docs/alpha/05-mcp-spec.md)
  // ---------------------------------------------------------------------

  server.registerTool(
    "list_proposals",
    { title: "List Proposals", description: "Unacknowledged parameter-search proposals awaiting review. Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listProposals(userIdOf(ctx));
    },
  );

  server.registerTool(
    "apply_proposal",
    {
      title: "Apply Proposal",
      description: "Applies a proposal's proposed params to its strategy and logs an 'applied' event. Requires alpha:manage.",
      inputSchema: z.object({ eventId: z.string() }),
    },
    async ({ eventId }, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.applyProposal(userIdOf(ctx), eventId);
    },
  );

  server.registerTool(
    "get_strategy_stats",
    {
      title: "Get Strategy Stats",
      description: "Daily alpha_strategy_stats rows (ROI CI, hit rate, Brier, RPS, CLV, drawdown, Sharpe, budget) for one of your strategies, optionally date-ranged. Requires alpha:read.",
      inputSchema: z.object({ strategyId: z.string(), from: z.string().optional(), to: z.string().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getStrategyStats(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_health",
    {
      title: "Get Health",
      description: "Scheduler last-tick per cron job, rate budgets remaining per provider, adapter credential status, and stale-data warnings. Requires alpha:read.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getHealth(userIdOf(ctx));
    },
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha: Phase 7 finish (docs/alpha/PROMPT-alpha-finish.md §2) —
  // the 13 remaining spec tools.
  // ---------------------------------------------------------------------

  server.registerTool(
    "get_balances",
    { title: "Get Balances", description: "Cash balance per Alpha venue (unavailable venues report why, e.g. a missing API key). Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getBalances(userIdOf(ctx));
    },
  );

  server.registerTool(
    "set_venue_credentials",
    {
      title: "Set Venue Credentials",
      description:
        "Stores or rotates a venue's API key in Vault (env-var fallback until Vault is wired — see docs/alpha/STATUS.md). Never returns the secret, only a short confirmation prefix. Requires alpha:credentials.",
      inputSchema: z.object({
        venue: z.enum(service.CREDENTIAL_VENUES),
        secret: z.string().min(1).max(500),
        scope: z.enum(["read", "trade"]).optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:credentials");
      if (denied) return errorContent(denied);
      return alphaTools.setVenueCredentials(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "backtest_strategy",
    {
      title: "Backtest Strategy",
      description:
        "Walk-forward backtest over logged fixtures+odds for a zoqo-sportsbook football strategy (the one venue with a real backtest engine right now). Requires alpha:run.",
      inputSchema: z.object({
        strategyKey: z.string(),
        venue: z.string(),
        from: z.string(),
        to: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.backtestStrategy(args);
    },
  );

  server.registerTool(
    "get_runs",
    {
      title: "Get Runs",
      description: "Recent alpha_runs rows (log lines, intent/accepted/rejected counts), optionally filtered by strategy. Requires alpha:read.",
      inputSchema: z.object({ strategyId: z.string().optional(), limit: z.number().positive().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getRuns(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_run",
    { title: "Get Run", description: "One alpha_runs row by id, including its full log. Requires alpha:read.", inputSchema: z.object({ runId: z.string() }) },
    async ({ runId }, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getRun(userIdOf(ctx), runId);
    },
  );

  server.registerTool(
    "list_orders",
    {
      title: "List Orders",
      description: "Your alpha_orders rows, optionally filtered by venue/status/since. Requires alpha:read.",
      inputSchema: z.object({ venue: z.string().optional(), status: z.string().optional(), since: z.string().optional(), limit: z.number().positive().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listOrders(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "place_intent",
    {
      title: "Place Intent",
      description:
        "Places an order on an Alpha venue exactly like a strategy would — goes through the same risk gate (evaluateIntent), no bypass for agent-driven orders. A stake above what the gate would allow is rejected and logged, not silently downsized. Requires alpha:run.",
      inputSchema: z.object({
        venue: z.string(),
        marketId: z.string(),
        outcomeId: z.string().optional(),
        side: z.enum(["buy", "sell", "long", "short", "back", "lay", "yes", "no"]),
        kind: z.enum(["market", "limit"]),
        limitPrice: z.number().positive().optional(),
        stake: z.number().positive().optional(),
        rationale: z.string(),
      }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.placeIntent(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel Order",
      description: "Cancels a resting order. Venues without a cancel() method (most paper/simulated venues) return a clear error. Requires alpha:run.",
      inputSchema: z.object({ orderId: z.string() }),
    },
    async ({ orderId }, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.cancelOrder(userIdOf(ctx), orderId);
    },
  );

  server.registerTool(
    "settle_now",
    { title: "Settle Now", description: "Forces a settlement pass for this account, optionally scoped to one venue. Requires alpha:run.", inputSchema: z.object({ venue: z.string().optional() }) },
    async ({ venue }, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.settleNow(userIdOf(ctx), venue);
    },
  );

  server.registerTool(
    "get_settings",
    { title: "Get Settings", description: "Kill switch, tracked leagues, base currency. Requires alpha:read.", inputSchema: z.object({}) },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getSettings(userIdOf(ctx));
    },
  );

  server.registerTool(
    "set_settings",
    {
      title: "Set Settings",
      description: "Edit tracked leagues and/or base currency. Requires alpha:manage.",
      inputSchema: z.object({ leagues: z.array(z.string()).optional(), baseCurrency: z.string().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.setSettings(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_events",
    {
      title: "Get Events",
      description: "alpha_events feed (info/paused/resumed/proposal/applied/error/kill), optionally filtered by kind or since a timestamp. Requires alpha:read.",
      inputSchema: z.object({ since: z.string().optional(), kinds: z.array(z.string()).optional(), limit: z.number().positive().optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getEvents(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "ack_event",
    { title: "Ack Event", description: "Marks an alpha_events row acknowledged. Requires alpha:manage.", inputSchema: z.object({ id: z.string() }) },
    async ({ id }, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.ackEvent(userIdOf(ctx), id);
    },
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha: MCP resources (read-only, docs/alpha/05-mcp-spec.md) —
  // every read callback re-checks alpha:read the same way a tool handler
  // does; resources aren't a lower-trust surface than tools here.
  // ---------------------------------------------------------------------

  server.registerResource(
    "alpha-strategy",
    new ResourceTemplate("zoqo://alpha/strategies/{id}", { list: undefined }),
    { title: "Alpha Strategy", description: "One strategy instance by id.", mimeType: "application/json" },
    async (uri, variables, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return { contents: [{ uri: uri.href, text: denied }] };
      const userId = userIdOf(ctx);
      const supabase = createServiceRoleClient();
      const strategyId = String(variables.id);
      const strategies = await service.listStrategies(supabase, userId);
      const match = strategies.find((s) => s.id === strategyId);
      if (!match) return { contents: [{ uri: uri.href, text: `strategy ${strategyId} not found or not owned by this user` }] };
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(match, null, 2) }] };
    },
  );

  server.registerResource(
    "alpha-fixture",
    new ResourceTemplate("zoqo://alpha/fixtures/{id}", { list: undefined }),
    { title: "Alpha Fixture", description: "One football fixture plus its odds history.", mimeType: "application/json" },
    async (uri, variables, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return { contents: [{ uri: uri.href, text: denied }] };
      const fixtureId = String(variables.id);
      const supabase = createServiceRoleClient();
      const { data: fixture } = await supabase.from("alpha_fixtures").select("*").eq("id", fixtureId).maybeSingle();
      if (!fixture) return { contents: [{ uri: uri.href, text: `fixture ${fixtureId} not found` }] };
      const { data: odds } = await supabase.from("alpha_odds_snapshots").select("*").eq("fixture_id", fixtureId).order("ts", { ascending: false }).limit(200);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify({ fixture, odds: odds ?? [] }, null, 2) }] };
    },
  );

  server.registerResource(
    "alpha-leaderboard",
    "zoqo://alpha/leaderboard",
    { title: "Alpha Leaderboard", description: "Strategies ranked by performance.", mimeType: "application/json" },
    async (uri, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return { contents: [{ uri: uri.href, text: denied }] };
      const supabase = createServiceRoleClient();
      const leaderboard = await service.getLeaderboard(supabase, userIdOf(ctx));
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(leaderboard, null, 2) }] };
    },
  );

  // Serves docs/alpha/*.md read-only so an agent can read the spec it's
  // operating under. Path-traversal guarded: `file` must resolve to a
  // direct child of docs/alpha with a .md extension — no `..`, no
  // subdirectories (docs/alpha/plans/*.md is intentionally out of reach;
  // that's session working history, not the spec).
  server.registerResource(
    "alpha-docs",
    new ResourceTemplate("zoqo://docs/alpha/{file}", { list: undefined }),
    { title: "Alpha Docs", description: "Markdown files under docs/alpha/ (the spec this program operates under).", mimeType: "text/markdown" },
    async (uri, variables) => {
      const file = String(variables.file ?? "");
      if (!/^[\w-]+\.md$/.test(file)) {
        return { contents: [{ uri: uri.href, text: "file must be a bare *.md filename directly under docs/alpha/ (no paths)" }] };
      }
      const docsDir = path.join(process.cwd(), "docs", "alpha");
      const filePath = path.join(docsDir, file);
      if (path.dirname(filePath) !== docsDir) {
        return { contents: [{ uri: uri.href, text: "invalid path" }] };
      }
      try {
        const text = await readFile(filePath, "utf8");
        return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
      } catch {
        return { contents: [{ uri: uri.href, text: `docs/alpha/${file} not found` }] };
      }
    },
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha: MCP prompts (docs/alpha/05-mcp-spec.md)
  // ---------------------------------------------------------------------

  server.registerPrompt(
    "daily-review",
    { title: "Daily Review", description: "Leaderboard, recent events, open proposals, and open orders assembled into a review brief." },
    async (ctx: { http?: { authInfo?: { scopes?: string[]; extra?: Record<string, unknown> } } }) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return { messages: [{ role: "user", content: { type: "text", text: denied } }] };
      const userId = userIdOf(ctx);
      const supabase = createServiceRoleClient();
      const [leaderboard, events, proposals, openOrders] = await Promise.all([
        service.getLeaderboard(supabase, userId),
        service.listEvents(supabase, userId, { limit: 20 }),
        service.listProposals(supabase, userId),
        service.listOrders(supabase, userId, { status: "open", limit: 20 }),
      ]);
      const text = [
        "# ZOQO Alpha daily review",
        "",
        "## Leaderboard",
        JSON.stringify(leaderboard, null, 2),
        "",
        "## Recent events",
        JSON.stringify(events, null, 2),
        "",
        "## Open proposals",
        JSON.stringify(proposals, null, 2),
        "",
        "## Open orders",
        JSON.stringify(openOrders, null, 2),
      ].join("\n");
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );

  server.registerPrompt(
    "pre-kickoff-scan",
    {
      title: "Pre-Kickoff Scan",
      description: "Football fixtures in the next N hours with a model-vs-market edge above a threshold.",
      argsSchema: z.object({ hoursAhead: z.string().optional(), minEdge: z.string().optional() }),
    },
    async ({ hoursAhead, minEdge }, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return { messages: [{ role: "user", content: { type: "text", text: denied } }] };
      const hours = Number(hoursAhead ?? "24") || 24;
      const threshold = Number(minEdge ?? "0.03") || 0.03;
      const supabase = createServiceRoleClient();
      const now = new Date();
      const until = new Date(now.getTime() + hours * 60 * 60_000);
      const { data: fixtures } = await supabase
        .from("alpha_fixtures")
        .select("id, home_team, away_team, kickoff_at, league_id")
        .gte("kickoff_at", now.toISOString())
        .lte("kickoff_at", until.toISOString())
        .order("kickoff_at", { ascending: true })
        .limit(50);

      const scanned = [];
      for (const f of fixtures ?? []) {
        const prediction = await runPredictFixture(supabase, f.id, "blend");
        if (!prediction?.edgeByOutcome) continue;
        const maxEdge = Math.max(prediction.edgeByOutcome.home, prediction.edgeByOutcome.draw, prediction.edgeByOutcome.away);
        if (maxEdge >= threshold) scanned.push({ fixture: f, prediction, maxEdge });
      }

      const text = `# Pre-kickoff scan (next ${hours}h, min edge ${threshold})\n\n${
        scanned.length === 0 ? "No fixtures above the edge threshold in this window." : JSON.stringify(scanned, null, 2)
      }`;
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );

  // ---------------------------------------------------------------------
  // ZOQO Alpha: copy trading (docs/alpha/08-copy-trading.md §8)
  // ---------------------------------------------------------------------

  server.registerTool(
    "list_copy_sources",
    {
      title: "List Copy Sources",
      description: "Your alpha_copy_sources rows, optionally filtered by venue/status. Requires alpha:read.",
      inputSchema: z.object({ venue: z.string().optional(), status: z.enum(["candidate", "followed", "dropped", "blocked"]).optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.listCopySources(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_copy_source",
    {
      title: "Get Copy Source",
      description: "One source's metrics, recent detected fills, and your own copies of it (for the gap). Requires alpha:read.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getCopySource(userIdOf(ctx), id);
    },
  );

  server.registerTool(
    "propose_copy_sources",
    {
      title: "Propose Copy Sources",
      description:
        "Runs the source screen now and returns/stores scored candidates. Polymarket discovers real leaderboard wallets automatically; Manifold has no public leaderboard API, so pass candidateRefs (known usernames) explicitly for it. Requires alpha:run.",
      inputSchema: z.object({ venue: z.enum(["polymarket-sim", "manifold"]), candidateRefs: z.array(z.string()).optional() }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:run");
      if (denied) return errorContent(denied);
      return alphaTools.proposeCopySources(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "set_copy_source_status",
    {
      title: "Set Copy Source Status",
      description: "Confirms (or drops/blocks) a candidate source — the one human-confirmation step before a source is actually followed. Requires alpha:manage.",
      inputSchema: z.object({ id: z.string(), status: z.enum(["candidate", "followed", "dropped", "blocked"]) }),
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, "alpha:manage");
      if (denied) return errorContent(denied);
      return alphaTools.setCopySourceStatus(userIdOf(ctx), args);
    },
  );

  server.registerTool(
    "get_copy_gap",
    {
      title: "Get Copy Gap",
      description: "Our return/CLV and lag distribution on a copy strategy's copied trades. Requires alpha:read.",
      inputSchema: z.object({ strategyId: z.string() }),
    },
    async ({ strategyId }, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getCopyGap(userIdOf(ctx), strategyId);
    },
  );
});

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const verified = await verifyApiKey(bearerToken);
    if (!verified) return undefined;
    return { token: bearerToken, clientId: verified.userId, scopes: verified.scopes, extra: { userId: verified.userId } };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST };
