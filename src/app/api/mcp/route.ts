import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyApiKey } from "@/lib/mcp/auth";
import * as tools from "@/lib/mcp/tools";
import { ConditionSchema, ActionSchema } from "@/lib/mcp/tools";

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
});

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const verified = await verifyApiKey(bearerToken);
    if (!verified) return undefined;
    return { token: bearerToken, clientId: verified.userId, scopes: [verified.scope], extra: { userId: verified.userId } };
  },
  { required: true },
);

export { authHandler as GET, authHandler as POST };
