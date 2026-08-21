import { Activity, LineChart, ShieldHalf, Timer, type LucideIcon } from "lucide-react";

/** Static "Popular Automation Templates" catalogue — mirrors the Figma grid
 *  (Time Entry / Price Trigger / Market Behaviour / Position Management).
 *  Purely presentational data; "Use Template" seeds CreateAutomationModal
 *  with these fields, it doesn't wire to any real execution logic.
 *
 *  `rule` is the static, default-value display string shown on the template
 *  card. `ruleTemplate` is the same sentence with `{key}` placeholders for
 *  every entry in `params` — CreateAutomationModal interpolates it live as
 *  the user edits values, so the automation gets created with a rule that
 *  reflects what was actually configured, not just the template default. */
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
  rule: string;
  ruleTemplate: string;
  params: AutomationParam[];
  cooldownLabel: string;
  executionsLabel: string;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "time-entry",
    icon: Timer,
    category: "Entry",
    title: "Time Entry",
    description: "Buy the instant a new window opens, before the crowd prices it in.",
    rule: '"When a new BTC 5m window opens, buy Up $25 at market."',
    ruleTemplate: '"When a new BTC 5m window opens, buy Up {amount} at market."',
    params: [{ key: "amount", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 }],
    cooldownLabel: "Cooldown 5m",
    executionsLabel: "10 Executions",
  },
  {
    key: "price-trigger",
    icon: Activity,
    category: "Signal",
    title: "Price Trigger",
    description: "Fire a trade the moment BTC moves a set amount in either direction.",
    rule: '"When BTC drops 0.15% in 1m, buy Up $25 at market."',
    ruleTemplate: '"When BTC drops {threshold} in 1m, buy Up {amount} at market."',
    params: [
      { key: "threshold", label: "Move threshold", default: 0.15, suffix: "%", min: 0.05, max: 2, step: 0.05 },
      { key: "amount", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 },
    ],
    cooldownLabel: "Cooldown 3m",
    executionsLabel: "15 Executions",
  },
  {
    key: "market-behaviour",
    icon: LineChart,
    category: "Schedule",
    title: "Market Behaviour",
    description: "Read the order book and tape, then buy whichever side the crowd favors.",
    rule: '"When implied odds cross 65¢, buy the favored side $25."',
    ruleTemplate: '"When implied odds cross {threshold}, buy the favored side {amount}."',
    params: [
      { key: "threshold", label: "Odds threshold", default: 65, suffix: "¢", min: 50, max: 95, step: 1 },
      { key: "amount", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 },
    ],
    cooldownLabel: "Cooldown 5m",
    executionsLabel: "12 Executions",
  },
  {
    key: "position-management",
    icon: ShieldHalf,
    category: "Exit",
    title: "Position Management",
    description: "Add protective exits to your entries so wins lock in on their own.",
    rule: '"If a position is up 20%, auto-close to lock in profit."',
    ruleTemplate: '"If a position is up {profit}, auto-close to lock in profit."',
    params: [{ key: "profit", label: "Profit trigger", default: 20, suffix: "%", min: 5, max: 100, step: 5 }],
    cooldownLabel: "Cooldown 1m",
    executionsLabel: "20 Executions",
  },
];
