import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyApiKey } from "@/lib/mcp/auth";
import * as tools from "@/lib/mcp/tools";
import { ConditionSchema, ActionSchema } from "@/lib/mcp/tools";
import * as alphaTools from "@/lib/mcp/alphaTools";

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
      description: "Scheduler last-tick per cron job, rate budgets remaining per provider, and stale-data warnings. Requires alpha:read.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const denied = requireScope(ctx, "alpha:read");
      if (denied) return errorContent(denied);
      return alphaTools.getHealth(userIdOf(ctx));
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
