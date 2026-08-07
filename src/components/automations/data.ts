import { Activity, LineChart, ShieldHalf, Timer, type LucideIcon } from "lucide-react";

/** Static "Popular Automation Templates" catalogue — mirrors the Figma grid
 *  (Time Entry / Price Trigger / Market Behaviour / Position Management).
 *  Purely presentational data; "Use Template" seeds CreateAutomationModal
 *  with these fields, it doesn't wire to any real execution logic. */
export interface AutomationTemplate {
  key: string;
  icon: LucideIcon;
  category: string;
  title: string;
  description: string;
  rule: string;
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
    cooldownLabel: "Cooldown 1m",
    executionsLabel: "20 Executions",
  },
];
