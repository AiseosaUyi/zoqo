import type { Strategy } from "../core/strategy";
import { terminalMaCross } from "./terminalMaCross";
import { terminalHourlyMomentum } from "./terminalHourlyMomentum";
import { manifoldMeanReversion } from "./manifoldMeanReversion";
import { manifoldLongshotFade } from "./manifoldLongshotFade";
import { manifoldControl } from "./manifoldControl";

/** Strategy registry — `alpha_strategies.strategy_key` looks up into this
 *  map. Add a new strategy by writing a module and registering it here;
 *  nothing else needs to know about the addition. */
export const STRATEGY_REGISTRY: Record<string, Strategy> = {
  [terminalMaCross.key]: terminalMaCross,
  [terminalHourlyMomentum.key]: terminalHourlyMomentum,
  [manifoldMeanReversion.key]: manifoldMeanReversion,
  [manifoldLongshotFade.key]: manifoldLongshotFade,
  [manifoldControl.key]: manifoldControl,
};

export function getStrategyTemplate(strategyKey: string): Strategy | null {
  return STRATEGY_REGISTRY[strategyKey] ?? null;
}

export function listStrategyTemplates(): Strategy[] {
  return Object.values(STRATEGY_REGISTRY);
}
