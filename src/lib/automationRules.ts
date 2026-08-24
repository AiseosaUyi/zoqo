import { ASSET_BY_ID } from "./assets";

/** Pure automation condition/action types + the display-sentence formatter
 *  — deliberately NOT in automations.ts, which is a `"use client"` module
 *  (owns the useAutomations() hook). Next.js's RSC boundary treats every
 *  export of a `"use client"` file as client-only, so server code (the MCP
 *  server's create_automation_trigger tool, src/lib/mcp/tools.ts) crashes
 *  calling describeAutomation() if it lived there — this file has no
 *  directive, so both the client hook and server tools can import it. */

export type AutomationCondition =
  | { type: "price-cross"; direction: "above" | "below"; price: number }
  | { type: "pct-change"; direction: "up" | "down"; pct: number; windowMin: number }
  | { type: "ma-cross"; fastMin: number; slowMin: number };

export interface AutomationAction {
  side: "long" | "short";
  sizeType: "fixed" | "pct-buying-power";
  sizeValue: number;
  stopLoss?: number;
  takeProfit?: number;
}

function describeCondition(symbol: string, condition: AutomationCondition): string {
  switch (condition.type) {
    case "price-cross":
      return `${symbol} crosses ${condition.direction} $${condition.price.toLocaleString()}`;
    case "pct-change":
      return `${symbol} moves ${condition.direction} ${condition.pct}% within ${condition.windowMin} min`;
    case "ma-cross":
      return `${symbol}'s ${condition.fastMin}min MA crosses its ${condition.slowMin}min MA`;
  }
}

function describeAction(action: AutomationAction): string {
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
