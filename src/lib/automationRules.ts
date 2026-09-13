import { ASSET_BY_ID } from "./assets";

/** Pure automation condition/action types + the display-sentence formatter
 *  — deliberately NOT in automations.ts, which is a `"use client"` module
 *  (owns the useAutomations() hook). Next.js's RSC boundary treats every
 *  export of a `"use client"` file as client-only, so server code (the MCP
 *  server's create_automation_trigger tool, src/lib/mcp/tools.ts) crashes
 *  calling describeAutomation() if it lived there — this file has no
 *  directive, so both the client hook and server tools can import it. */

// The three real price-evaluated condition types evaluate-triggers/route.ts
// already runs against a self-built price series. Exported separately so
// that route can type its price-evaluation helpers narrowly (a `schedule`
// condition never reaches them — see this file's AutomationCondition
// comment and the route's dedicated schedule/run-strategy branch).
export type PriceCondition =
  | { type: "price-cross"; direction: "above" | "below"; price: number }
  | { type: "pct-change"; direction: "up" | "down"; pct: number; windowMin: number }
  | { type: "ma-cross"; fastMin: number; slowMin: number };

export type AutomationCondition =
  | PriceCondition
  // ZOQO Alpha bridge (docs/alpha/03-architecture.md §2, 07-build-plan.md
  // Phase 1): fires on a wall-clock interval rather than a price event —
  // the "trade every hour" case. `{ cron: string }` is accepted-but-
  // unimplemented for now (validated as a well-formed shape so a future
  // phase can add real cron-expression parsing without a schema change);
  // only `everyMin` actually fires anything today.
  | { type: "schedule"; everyMin: number }
  | { type: "schedule"; cron: string };

// The original (and still default) action shape: place a terminal order.
// `type` is optional and — pre-Alpha — was never set at all (every existing
// template/fallback/mapper literal predates this field), so it's kept
// optional rather than a required `"order"` literal purely to avoid a
// repo-wide literal-updating churn; `undefined` and `"order"` mean the same
// thing everywhere this is read.
export interface AutomationOrderAction {
  type?: "order";
  side: "long" | "short";
  sizeType: "fixed" | "pct-buying-power";
  sizeValue: number;
  stopLoss?: number;
  takeProfit?: number;
}

// Runs an existing ZOQO Alpha strategy instance (alpha_strategies.id)
// instead of placing a terminal order directly — the evaluator calls
// service.runStrategyNow rather than terminalExecution.ts for this one
// action type. Intentionally has none of the order-shaped fields above:
// sizing/side/stops are the strategy's own params, not this automation's.
export interface AutomationRunStrategyAction {
  type: "run-strategy";
  strategyId: string;
}

export type AutomationAction = AutomationOrderAction | AutomationRunStrategyAction;

function describeCondition(symbol: string, condition: AutomationCondition): string {
  switch (condition.type) {
    case "price-cross":
      return `${symbol} crosses ${condition.direction} $${condition.price.toLocaleString()}`;
    case "pct-change":
      return `${symbol} moves ${condition.direction} ${condition.pct}% within ${condition.windowMin} min`;
    case "ma-cross":
      return `${symbol}'s ${condition.fastMin}min MA crosses its ${condition.slowMin}min MA`;
    case "schedule":
      return "cron" in condition ? `on schedule "${condition.cron}"` : `every ${condition.everyMin} min`;
  }
}

function describeAction(action: AutomationAction): string {
  if (action.type === "run-strategy") return "run the linked Alpha strategy";
  const size = action.sizeType === "fixed" ? `$${action.sizeValue}` : `${action.sizeValue}% of buying power`;
  return `${action.side === "long" ? "buy" : "sell"} ${size}`;
}

/** Human-readable preview sentence for a condition/action pair — used both
 *  for a template's static card preview and a live automation's stored
 *  `rule` (computed once at create/update time, not re-derived on render). */
export function describeAutomation(symbolId: string, condition: AutomationCondition, action: AutomationAction): string {
  const symbol = ASSET_BY_ID[symbolId]?.symbol ?? symbolId;
  return `"When ${describeCondition(symbol, condition)}, ${describeAction(action)}."`;
}
