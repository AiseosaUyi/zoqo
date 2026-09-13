import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getStrategyTemplate } from "./strategies";

/** Weekly walk-forward parameter search (docs/alpha/03-architecture.md §7
 *  Level 4). `/api/cron/alpha-evaluate` calls `runParamSearch` once per
 *  strategy that declares a `paramSpace` (see `core/strategy.ts`), gated to
 *  once a week — never applies anything itself, only ever writes an
 *  `alpha_events` row of kind `proposal`. `service.ts`'s `applyProposal` is
 *  the ONLY path from a proposal to live `alpha_strategies.params`.
 *
 *  HONEST LIMITATION, stated once here rather than re-litigated at every call
 *  site: this is NOT a true walk-forward backtest. A true backtest would
 *  re-run a strategy's actual `evaluate()` logic against historical raw
 *  market data under each candidate param set — `06-football-model.md`'s own
 *  backtest (Phase 3) is the one place in this program that really does
 *  that, for football specifically, because it has raw fixture/odds history
 *  to replay against. Nothing else in this program persists enough raw
 *  market data to re-run arbitrary strategy code historically. What THIS
 *  module does instead — the honestly-scoped approximation this phase's own
 *  brief calls for — is re-score the decisions a strategy ALREADY MADE under
 *  its live params: `alpha_decisions.features` is a snapshot of the numbers
 *  the strategy computed at decision time, and for any candidate param that
 *  is itself a THRESHOLD the strategy checks a logged feature against (e.g.
 *  `terminalHourlyMomentum`'s `minReturnAbs` against its own logged
 *  `return4h` feature), a stricter candidate value can honestly be applied
 *  post-hoc as a filter on which already-fired decisions "would still
 *  qualify." It can NEVER add back a decision the strategy's actual params
 *  skipped at the time (that trade was never logged at all), and it can't
 *  reconstruct the effect of a non-threshold param (e.g. a moving-average
 *  window size) that changes what gets COMPUTED, not just what gets
 *  filtered — see `scoreCandidate`'s own comment for exactly which param
 *  shapes this can and can't honestly re-score. */

type Client = SupabaseClient<Database>;

const MAX_COMBINATIONS = 200;
const MIN_SAMPLES_FOR_SEARCH = 20; // need enough logged history for a fit/test split to mean anything
const MIN_HALF_SAMPLES = 8; // each half of the walk-forward split needs at least this many settled decisions
const MIN_CANDIDATE_SURVIVORS = 5; // a candidate scored on too few surviving orders is noise, not a finding
const IMPROVEMENT_THRESHOLD = 0.05; // propose only when the test-window ROI beats baseline by >5% relative — documented per this phase's brief

/** Cartesian product of a `paramSpace`, capped at `MAX_COMBINATIONS` (no
 *  unbounded search) — truncates in enumeration order once the cap is hit
 *  rather than sampling randomly, since a deterministic order makes this
 *  function's output reproducible for the same input, which matters for the
 *  unit test. Returns `[{}]` (one, empty, candidate) for an empty
 *  `paramSpace` so callers never have to special-case "no params to vary." */
export function cartesianProduct(paramSpace: Record<string, number[]>): Record<string, number>[] {
  const keys = Object.keys(paramSpace);
  if (keys.length === 0) return [{}];

  let combos: Record<string, number>[] = [{}];
  for (const key of keys) {
    const values = paramSpace[key];
    const next: Record<string, number>[] = [];
    outer: for (const combo of combos) {
      for (const v of values) {
        next.push({ ...combo, [key]: v });
        if (next.length >= MAX_COMBINATIONS) break outer;
      }
    }
    combos = next;
    if (combos.length >= MAX_COMBINATIONS) break;
  }
  return combos.slice(0, MAX_COMBINATIONS);
}

export interface LoggedDecisionOutcome {
  features: Record<string, number | string> | null;
  pnl: number;
  stake: number;
}

export interface CandidateScore {
  roi: number;
  n: number;
  totalStake: number;
}

/** Re-scores `dataset` (already-fired decisions with a settled outcome)
 *  under `candidate`. For every `candidate` key whose name starts with
 *  "min"/"max" AND maps (via `featureKeyMap`, or the same name by default —
 *  see `core/strategy.ts`'s `paramFeatureKeys`) to a NUMERIC feature logged
 *  on a decision, that decision survives only if its logged feature value
 *  clears the candidate's threshold (a "min*" key requires `|feature| >=
 *  candidate`, a "max*" key requires `|feature| <= candidate`) — this is
 *  exactly `terminalHourlyMomentum`'s `minReturnAbs` (mapped to its
 *  `return4h` feature) shape. Every other key (no mapped feature, or a
 *  non-threshold-shaped name like a moving-average window) can't be
 *  honestly re-scored from a point-in-time feature snapshot and is silently
 *  a no-op filter for that key — decisions are neither added nor removed on
 *  its account. This is the module header's documented approximation, made
 *  concrete. */
export function scoreCandidate(dataset: LoggedDecisionOutcome[], candidate: Record<string, number>, featureKeyMap: Record<string, string> = {}): CandidateScore {
  let survivors = dataset;
  for (const [key, value] of Object.entries(candidate)) {
    const lower = key.toLowerCase();
    const isMin = lower.startsWith("min");
    const isMax = lower.startsWith("max");
    if (!isMin && !isMax) continue;
    const featureKey = featureKeyMap[key] ?? key;
    survivors = survivors.filter((d) => {
      const raw = d.features?.[featureKey];
      if (typeof raw !== "number") return true; // nothing logged to judge this decision against — keep it rather than guess
      const magnitude = Math.abs(raw);
      return isMin ? magnitude >= value : magnitude <= value;
    });
  }
  const totalStake = survivors.reduce((sum, d) => sum + d.stake, 0);
  const totalPnl = survivors.reduce((sum, d) => sum + d.pnl, 0);
  return { roi: totalStake > 0 ? totalPnl / totalStake : 0, n: survivors.length, totalStake };
}

export interface ParamSearchResult {
  proposed: boolean;
  reason: string;
  strategyId: string;
  eventId?: string;
}

/** Reads `strategyId`'s own template + logged history, searches its declared
 *  `paramSpace`, and writes an `alpha_events` `proposal` row if a candidate
 *  clears `IMPROVEMENT_THRESHOLD` on a held-out (walk-forward) window. Never
 *  writes `alpha_strategies.params` directly. */
export async function runParamSearch(supabase: Client, strategyId: string): Promise<ParamSearchResult> {
  const { data: strategy } = await supabase.from("alpha_strategies").select("id, user_id, strategy_key, params").eq("id", strategyId).maybeSingle();
  if (!strategy) return { proposed: false, reason: "strategy not found", strategyId };

  const template = getStrategyTemplate(strategy.strategy_key);
  if (!template?.paramSpace || Object.keys(template.paramSpace).length === 0) {
    return { proposed: false, reason: "strategy has no declared paramSpace", strategyId };
  }

  const { data: decisions } = await supabase
    .from("alpha_decisions")
    .select("id, features")
    .eq("strategy_id", strategyId)
    .eq("status", "accepted")
    .order("decided_at", { ascending: true });
  const decisionRows = decisions ?? [];
  const decisionIds = decisionRows.map((d) => d.id);
  if (decisionIds.length === 0) return { proposed: false, reason: "no logged decisions yet", strategyId };

  const { data: orders } = await supabase.from("alpha_orders").select("decision_id, pnl, stake").in("decision_id", decisionIds).eq("status", "settled");
  const orderByDecision = new Map<string, { pnl: number; stake: number }>();
  for (const o of orders ?? []) {
    if (o.pnl == null) continue;
    orderByDecision.set(o.decision_id, { pnl: o.pnl, stake: o.stake });
  }

  const dataset: LoggedDecisionOutcome[] = [];
  for (const d of decisionRows) {
    const order = orderByDecision.get(d.id);
    if (!order) continue;
    dataset.push({ features: (d.features as Record<string, number | string> | null) ?? null, pnl: order.pnl, stake: order.stake });
  }

  if (dataset.length < MIN_SAMPLES_FOR_SEARCH) {
    return { proposed: false, reason: `insufficient settled history for a walk-forward split (${dataset.length}/${MIN_SAMPLES_FOR_SEARCH})`, strategyId };
  }

  // WALK-FORWARD, NEVER IN-SAMPLE: chronological first-half is the FIT
  // window a candidate is picked from; the second-half TEST window is never
  // used to choose the winner, only to report how it would have done —
  // dataset is already ordered ascending by decided_at from the query above.
  const mid = Math.floor(dataset.length / 2);
  const fit = dataset.slice(0, mid);
  const test = dataset.slice(mid);
  if (fit.length < MIN_HALF_SAMPLES || test.length < MIN_HALF_SAMPLES) {
    return { proposed: false, reason: `fit/test split too small (${fit.length}/${test.length}, need ${MIN_HALF_SAMPLES} each)`, strategyId };
  }

  const featureKeyMap = template.paramFeatureKeys ?? {};
  const candidates = cartesianProduct(template.paramSpace);
  let best: { candidate: Record<string, number>; fitRoi: number; fitN: number } | null = null;
  for (const candidate of candidates) {
    const scored = scoreCandidate(fit, candidate, featureKeyMap);
    if (scored.n < MIN_CANDIDATE_SURVIVORS) continue;
    if (!best || scored.roi > best.fitRoi) best = { candidate, fitRoi: scored.roi, fitN: scored.n };
  }
  if (!best) return { proposed: false, reason: "no candidate retained enough fit-window samples to score", strategyId };

  const baselineTest = scoreCandidate(test, {}, featureKeyMap); // {} = today's actual params, unfiltered
  const candidateTest = scoreCandidate(test, best.candidate, featureKeyMap);
  if (candidateTest.n < MIN_CANDIDATE_SURVIVORS) {
    return { proposed: false, reason: "best fit-window candidate didn't retain enough test-window samples to confirm", strategyId };
  }

  const expectedImprovement =
    baselineTest.roi !== 0 ? (candidateTest.roi - baselineTest.roi) / Math.abs(baselineTest.roi) : candidateTest.roi > 0 ? candidateTest.roi : 0;

  if (expectedImprovement <= IMPROVEMENT_THRESHOLD) {
    return {
      proposed: false,
      reason: `best candidate's test-window improvement (${(expectedImprovement * 100).toFixed(1)}%) doesn't clear the ${(IMPROVEMENT_THRESHOLD * 100).toFixed(0)}% threshold`,
      strategyId,
    };
  }

  const currentParams = (strategy.params as Record<string, unknown>) ?? {};
  const { data: event } = await supabase
    .from("alpha_events")
    .insert({
      user_id: strategy.user_id,
      strategy_id: strategyId,
      kind: "proposal",
      payload: {
        strategyId,
        currentParams,
        proposedParams: best.candidate,
        expectedImprovement,
        baselineRoi: baselineTest.roi,
        candidateRoi: candidateTest.roi,
        fitSampleSize: best.fitN,
        testSampleSize: candidateTest.n,
        note: "Approximated by re-scoring already-logged decisions (see paramSearch.ts header) — not a full re-run of strategy logic against historical raw market data.",
      } as never,
    })
    .select("id")
    .single();

  return { proposed: true, reason: "proposal written", strategyId, eventId: event?.id };
}
