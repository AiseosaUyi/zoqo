import type { Strategy } from "../core/strategy";
import { terminalMaCross } from "./terminalMaCross";
import { terminalHourlyMomentum } from "./terminalHourlyMomentum";

/** Strategy registry — `alpha_strategies.strategy_key` looks up into this
 *  map. Add a new strategy by writing a module and registering it here;
 *  nothing else needs to know about the addition. */
export const STRATEGY_REGISTRY: Record<string, Strategy> = {
  [terminalMaCross.key]: terminalMaCross,
  [terminalHourlyMomentum.key]: terminalHourlyMomentum,
};

export function getStrategyTemplate(strategyKey: string): Strategy | null {
  return STRATEGY_REGISTRY[strategyKey] ?? null;
}

export function listStrategyTemplates(): Strategy[] {
  return Object.values(STRATEGY_REGISTRY);
}
