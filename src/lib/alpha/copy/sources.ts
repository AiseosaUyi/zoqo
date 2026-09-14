/** Copy-trading source screening (docs/alpha/08-copy-trading.md §2) — the
 *  scored nightly screen `alpha-evaluate` runs, stored in
 *  `alpha_copy_sources`. `scoreSource` is pure (no I/O) so it's unit-tested
 *  directly on a fixture of synthetic fills, same "pure decision logic"
 *  discipline as `risk.ts`/`budgetRule.ts`; `runSourceScreen` is the thin
 *  DB-touching wrapper the evaluator/MCP `propose_copy_sources` call.
 *
 *  Honesty note on the composite `score`: this is a documented heuristic
 *  weighting of Brier/profit-factor/consistency/copyability, not a
 *  scientifically fitted model — the spec (§2) names the components to
 *  track, not a formula, so one is picked here and named as a heuristic
 *  rather than presented as more rigorous than it is. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export interface SourceFillRecord {
  filledAt: number; // ms epoch
  marketId: string;
  side: "buy" | "sell";
  /** Implied probability (0..1) of the side taken, at entry. */
  priceAtEntry: number;
  sizeUsd: number;
  resolved: boolean;
  /** Only meaningful when `resolved`. */
  won?: boolean;
  /** Realized pnl in USD-equivalent — only meaningful when `resolved`. */
  pnl?: number;
}

export interface SourceMetrics {
  n: number;
  resolvedN: number;
  daysActive: number;
  daysSinceLastFill: number;
  brier: number | null;
  /** Mean of (resolutionValue - priceAtEntry), signed so positive = the
   *  source's entry price was, on average, better than the eventual truth
   *  — a resolution-based CLV proxy (see module header: this program has
   *  no separate closing-line snapshot for arbitrary source markets, so
   *  the resolution outcome stands in for "what the price should have
   *  been"). */
  clvProxy: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  /** Share of active months with positive net pnl. */
  consistency: number | null;
  /** 0..1, 1 = very copyable (small relative to typical depth). */
  copyability: number;
  marketConcentration: number;
}

export interface ScoreSourceOptions {
  now?: number;
  /** Used only for `copyability` — the depth a typical fill would need to
   *  clear without moving the price meaningfully. No real per-market depth
   *  history is threaded through here (that lives in `marketFeatures.ts`
   *  for THIS program's own venues, not an arbitrary source's markets), so
   *  this is a single configurable assumption, not a per-market lookup —
   *  documented, not hidden. */
  typicalDepthUsd?: number;
  minHistory?: number;
  minDaysActive?: number;
  maxDaysSinceLastFill?: number;
  minScoreToFollow?: number;
}

export const SCORE_SOURCE_DEFAULTS: Required<ScoreSourceOptions> = {
  now: 0, // overridden per-call below when omitted
  typicalDepthUsd: 5000,
  minHistory: 200,
  minDaysActive: 90,
  maxDaysSinceLastFill: 14,
  minScoreToFollow: 0.55,
};

export interface SourceScoreResult {
  metrics: SourceMetrics;
  /** 0..1 composite — see module header on why this is a named heuristic. */
  score: number;
  /** Minimum-history/recency gate from §2 — independent of `score` itself,
   *  since a source can score well on too little data to trust. */
  meetsMinimumHistory: boolean;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function scoreSource(fills: SourceFillRecord[], opts: ScoreSourceOptions = {}): SourceScoreResult {
  const o = { ...SCORE_SOURCE_DEFAULTS, ...opts, now: opts.now ?? Date.now() };
  const n = fills.length;
  const resolved = fills.filter((f) => f.resolved);
  const resolvedN = resolved.length;

  const firstFillMs = fills.length ? Math.min(...fills.map((f) => f.filledAt)) : o.now;
  const lastFillMs = fills.length ? Math.max(...fills.map((f) => f.filledAt)) : o.now;
  const daysActive = (lastFillMs - firstFillMs) / 86_400_000;
  const daysSinceLastFill = (o.now - lastFillMs) / 86_400_000;

  const brier = resolvedN > 0 ? resolved.reduce((sum, f) => sum + (f.priceAtEntry - (f.won ? 1 : 0)) ** 2, 0) / resolvedN : null;

  const clvProxy =
    resolvedN > 0
      ? resolved.reduce((sum, f) => {
          const resolutionValue = f.won ? 1 : 0;
          const signed = f.side === "buy" ? resolutionValue - f.priceAtEntry : f.priceAtEntry - resolutionValue;
          return sum + signed;
        }, 0) / resolvedN
      : null;

  const pnlValues = resolved.filter((f) => f.pnl != null).map((f) => f.pnl!);
  const grossWin = pnlValues.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pnlValues.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const profitFactor = pnlValues.length > 0 ? (grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0) : null;

  let maxDrawdown: number | null = null;
  if (pnlValues.length > 0) {
    const byTime = [...resolved].filter((f) => f.pnl != null).sort((a, b) => a.filledAt - b.filledAt);
    let cumulative = 0;
    let peak = 0;
    let worstDrawdown = 0;
    for (const f of byTime) {
      cumulative += f.pnl!;
      peak = Math.max(peak, cumulative);
      worstDrawdown = Math.min(worstDrawdown, cumulative - peak);
    }
    maxDrawdown = worstDrawdown; // <= 0
  }

  let consistency: number | null = null;
  if (resolved.length > 0) {
    const byMonth = new Map<string, number>();
    for (const f of resolved) {
      if (f.pnl == null) continue;
      const d = new Date(f.filledAt);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + f.pnl);
    }
    const months = [...byMonth.values()];
    consistency = months.length > 0 ? months.filter((m) => m > 0).length / months.length : null;
  }

  const medianSize = median(fills.map((f) => f.sizeUsd));
  const copyability = Math.max(0, Math.min(1, 1 - medianSize / o.typicalDepthUsd));

  const marketCounts = new Map<string, number>();
  for (const f of fills) marketCounts.set(f.marketId, (marketCounts.get(f.marketId) ?? 0) + 1);
  const topMarketShare = n > 0 ? Math.max(...marketCounts.values()) / n : 0;
  const marketConcentration = topMarketShare;

  const meetsMinimumHistory = n >= o.minHistory && daysActive >= o.minDaysActive && daysSinceLastFill <= o.maxDaysSinceLastFill;

  // Heuristic composite (see module header): skill (inverse Brier) weighted
  // highest, then profit factor (capped so one lucky home-run trade can't
  // dominate), consistency, copyability, with a concentration penalty.
  const skillComponent = brier != null ? Math.max(0, 1 - brier * 2) : 0;
  const pfComponent = profitFactor != null ? Math.max(0, Math.min(1, (Math.min(profitFactor, 5) - 1) / 4)) : 0;
  const consistencyComponent = consistency ?? 0;
  const concentrationPenalty = marketConcentration > 0.5 ? (marketConcentration - 0.5) : 0;
  const score = Math.max(
    0,
    Math.min(1, 0.4 * skillComponent + 0.25 * pfComponent + 0.2 * consistencyComponent + 0.15 * copyability - concentrationPenalty),
  );

  return {
    metrics: { n, resolvedN, daysActive, daysSinceLastFill, brier, clvProxy, profitFactor, maxDrawdown, consistency, copyability, marketConcentration },
    score,
    meetsMinimumHistory,
  };
}

export interface StabilityState {
  scoreHistory: { weekStart: string; score: number }[];
}

/** Two-consecutive-weeks-above-threshold rule (§2 "Stability"). Appends
 *  this week's score to the rolling history (trimmed to the last 8 weeks —
 *  enough to see a trend without the row growing unbounded) and returns
 *  whether the source is followable NOW. Pure — the caller persists
 *  `metrics.scoreHistory` back onto `alpha_copy_sources.metrics`. */
export function updateStability(prior: StabilityState | null, weekStart: string, score: number, minScoreToFollow: number): { state: StabilityState; followable: boolean } {
  const history = [...(prior?.scoreHistory ?? [])];
  const existingIdx = history.findIndex((h) => h.weekStart === weekStart);
  if (existingIdx >= 0) history[existingIdx] = { weekStart, score };
  else history.push({ weekStart, score });
  history.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const trimmed = history.slice(-8);

  const lastTwo = trimmed.slice(-2);
  const followable = lastTwo.length === 2 && lastTwo.every((h) => h.score >= minScoreToFollow);
  return { state: { scoreHistory: trimmed }, followable };
}

/** ISO week start (Monday, UTC) — used as the stability window key. */
export function weekStartOf(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Runs the screen for one venue's candidate/followed sources, updating
 *  `alpha_copy_sources`. `fetchFillsForSource` is injected so this stays
 *  testable without a network — the MCP `propose_copy_sources` tool and
 *  the nightly evaluator pass the real per-venue fetcher (see `follow.ts`'s
 *  `detectPolymarketFills`/`detectManifoldFills`). */
export async function runSourceScreen(
  supabase: Client,
  userId: string,
  venue: string,
  candidateRefs: string[],
  fetchFillsForSource: (sourceRef: string) => Promise<SourceFillRecord[]>,
  opts: ScoreSourceOptions = {},
): Promise<{ sourceRef: string; score: number; followable: boolean }[]> {
  const now = opts.now ?? Date.now();
  const week = weekStartOf(now);
  const out: { sourceRef: string; score: number; followable: boolean }[] = [];

  for (const sourceRef of candidateRefs) {
    const fills = await fetchFillsForSource(sourceRef);
    const { metrics, score, meetsMinimumHistory } = scoreSource(fills, { ...opts, now });

    const { data: existing } = await supabase.from("alpha_copy_sources").select("*").eq("user_id", userId).eq("venue", venue).eq("source_ref", sourceRef).maybeSingle();
    const priorStability = (existing?.metrics as { scoreHistory?: StabilityState["scoreHistory"] } | null)?.scoreHistory
      ? { scoreHistory: (existing!.metrics as { scoreHistory: StabilityState["scoreHistory"] }).scoreHistory }
      : null;
    const { state, followable } = meetsMinimumHistory ? updateStability(priorStability, week, score, opts.minScoreToFollow ?? SCORE_SOURCE_DEFAULTS.minScoreToFollow) : { state: priorStability ?? { scoreHistory: [] }, followable: false };

    const nextStatus = !meetsMinimumHistory
      ? "candidate"
      : followable
        ? existing?.status === "followed"
          ? "followed"
          : "candidate" // followable but not yet confirmed by the human — stays "candidate" until set_copy_source_status follows it
        : existing?.status === "followed"
          ? "dropped" // was followed, fell below threshold — auto-drop per §2's stability rule
          : "candidate";

    const payload = {
      user_id: userId,
      venue,
      source_ref: sourceRef,
      score,
      metrics: { ...metrics, scoreHistory: state.scoreHistory } as never,
      status: nextStatus,
      ...(nextStatus === "dropped" && existing?.status === "followed" ? { dropped_at: new Date(now).toISOString() } : {}),
    };
    if (existing) {
      await supabase.from("alpha_copy_sources").update(payload).eq("id", existing.id);
    } else {
      await supabase.from("alpha_copy_sources").insert(payload);
    }
    out.push({ sourceRef, score, followable });
  }
  return out;
}
