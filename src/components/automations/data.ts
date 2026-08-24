import { Activity, LineChart, TrendingUp, type LucideIcon } from "lucide-react";
import type { AutomationAction, AutomationCondition } from "@/lib/automations";
import { DEFAULT_ASSET_ID } from "@/lib/assets";

/** Static "Popular Automation Templates" catalogue. Previously these four
 *  cards ("Time Entry", "Price Trigger", "Market Behaviour", "Position
 *  Management") were built around the old prediction-market Up/Down mock —
 *  none of them map onto the real terminal-shaped condition types the
 *  trigger engine actually evaluates (TERMINAL_SPEC.md §8: price-cross,
 *  pct-change, ma-cross). Replaced with one template per real condition
 *  type, plus the existing "Custom" blank-template path in
 *  CreateAutomationModal.tsx — a deliberate scope cut, not an oversight
 *  (see PHASE_C_HANDOFF.md's C1). "Use Template" seeds CreateAutomationModal
 *  with these fields; the modal still lets every field be edited before
 *  creating. */
export interface AutomationParam {
  key: string;
  label: string;
  default: number;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface AutomationTemplate {
  key: string;
  icon: LucideIcon;
  category: string;
  title: string;
  description: string;
  symbol: string;
  condition: AutomationCondition;
  action: AutomationAction;
  /** Which of `condition`'s/`action`'s numeric fields the user can edit,
   *  and under what key on the merged condition+action+cap value bag. */
  params: AutomationParam[];
  cooldownLabel: string;
  helperText?: string;
}

const DEFAULT_MAX_ORDER_SIZE = 100;
const DEFAULT_DAILY_CAP = 250;

export { DEFAULT_MAX_ORDER_SIZE, DEFAULT_DAILY_CAP };

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "price-cross",
    icon: Activity,
    category: "Price",
    title: "Price Cross",
    description: "Fire the instant price crosses a level you set, in either direction.",
    symbol: DEFAULT_ASSET_ID,
    condition: { type: "price-cross", direction: "above", price: 120000 },
    action: { side: "long", sizeType: "fixed", sizeValue: 25 },
    params: [
      { key: "price", label: "Cross price", default: 120000, prefix: "$", min: 1, step: 1 },
      { key: "sizeValue", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 },
    ],
    cooldownLabel: "Evaluated every 1 min",
  },
  {
    key: "pct-change",
    icon: TrendingUp,
    category: "Momentum",
    title: "% Move",
    description: "Fire when price moves a set percentage within a rolling window.",
    symbol: DEFAULT_ASSET_ID,
    condition: { type: "pct-change", direction: "down", pct: 0.5, windowMin: 5 },
    action: { side: "long", sizeType: "fixed", sizeValue: 25 },
    params: [
      { key: "pct", label: "Move threshold", default: 0.5, suffix: "%", min: 0.05, max: 10, step: 0.05 },
      { key: "windowMin", label: "Window", default: 5, suffix: " min", min: 1, max: 60, step: 1 },
      { key: "sizeValue", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 },
    ],
    cooldownLabel: "Evaluated every 1 min",
    helperText: "Needs a few minutes of accumulated price history after creation before it can fire.",
  },
  {
    key: "ma-cross",
    icon: LineChart,
    category: "Trend",
    title: "MA Crossover",
    description: "Fire when a fast moving average crosses a slow one — a real trend signal.",
    symbol: DEFAULT_ASSET_ID,
    condition: { type: "ma-cross", fastMin: 5, slowMin: 20 },
    action: { side: "long", sizeType: "fixed", sizeValue: 25 },
    params: [
      { key: "fastMin", label: "Fast MA", default: 5, suffix: " min", min: 1, max: 60, step: 1 },
      { key: "slowMin", label: "Slow MA", default: 20, suffix: " min", min: 2, max: 240, step: 1 },
      { key: "sizeValue", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 },
    ],
    cooldownLabel: "Evaluated every 1 min",
    helperText: "Needs the slow MA's full window of accumulated price history before it can fire — up to a few hours for longer windows.",
  },
];
