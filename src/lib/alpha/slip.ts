import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { predictFixture } from "./predictFixture";
import { multiplicativeNormalize } from "./football/margin";
import type { FootballPrediction } from "./football/models";
import { kellyFraction } from "./kelly";
import { createVenueAdapter } from "./venues";

/** `build_slip` (docs/alpha/05-mcp-spec.md's football section,
 *  docs/alpha/03-architecture.md §8): given selections, returns odds/
 *  implied-probs/model-probs/Kelly stakes and a plain-text version a human
 *  can key into a bookmaker app — the one real-money bridge this program
 *  has, and it stays a preview by default. Shared by the `build_slip` MCP
 *  tool and `/api/alpha/slip` (the `/alpha` fixtures tab's slip builder) so
 *  the two surfaces can never drift, same "one function, several doors"
 *  shape as `service.ts`.
 *
 *  PARLAY SCOPE: `docs/alpha/plans/phase-3-football.md`'s scope-out list
 *  explicitly defers "accumulators/parlays" past this phase. This module
 *  still computes a combined-odds number across every selection (useful
 *  for a human keying a real parlay into a bookmaker app themselves — pure
 *  arithmetic, no placement involved), but `place: true` only ever executes
 *  a SINGLE-selection slip as an internal `zoqo-sportsbook` paper bet;
 *  multi-selection `place: true` calls are rejected with a clear reason
 *  rather than silently placing just the first leg. */

type Client = SupabaseClient<Database>;

export type SlipMarketKey = "1x2" | "ou25" | "btts" | "dc";
export type SlipOutcomeKey = "home" | "draw" | "away" | "over" | "under" | "yes" | "no" | "hd" | "da" | "ha";

export interface SlipSelectionInput {
  fixtureId: string;
  market: SlipMarketKey;
  outcome: SlipOutcomeKey;
  /** Pin to a specific book; omitted = best available price across books. */
  book?: string;
}

export interface SlipSelectionResult {
  fixtureId: string;
  fixtureLabel: string;
  market: SlipMarketKey;
  outcome: SlipOutcomeKey;
  book: string;
  decimalOdds: number;
  impliedProb: number;
  /** Margin-removed book probability for this exact outcome, when the
   *  chosen book quotes a complete, margin-removable set for this market
   *  (1x2's 3-way and ou25/btts's 2-way sets qualify; `dc`'s three
   *  independently-priced double-chance bets don't form a clean
   *  mutually-exclusive set to remove margin from, so this is `null` for
   *  `dc` selections — documented, not a bug). */
  marketProbRemoved: number | null;
  modelProb: number | null;
  edge: number | null;
  kellyStakeFraction: number | null;
}

export interface BuildSlipInput {
  selections: SlipSelectionInput[];
  stakeTotal?: number;
  strategyId?: string;
  place?: boolean;
  kellyFraction?: number;
}

export interface PlacedSlipLeg {
  decisionId: string;
  orderId: string | null;
  status: string;
}

export interface BuildSlipResult {
  selections: SlipSelectionResult[];
  combinedOdds: number;
  suggestedStake: number | null;
  plainText: string;
  placed?: PlacedSlipLeg;
}

interface OddsRow {
  book: string;
  outcome: string;
  decimal_odds: number;
}

async function readMarketSnapshot(supabase: Client, fixtureId: string, market: SlipMarketKey): Promise<OddsRow[]> {
  const { data } = await supabase
    .from("alpha_odds_snapshots")
    .select("book, outcome, decimal_odds, ts")
    .eq("fixture_id", fixtureId)
    .eq("market", market)
    .order("ts", { ascending: false });
  // Newest-first -> keep only the first (latest) row per (book, outcome).
  const seen = new Set<string>();
  const latest: OddsRow[] = [];
  for (const row of data ?? []) {
    const key = `${row.book}:${row.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(row);
  }
  return latest;
}

function marketProbForSelection(rowsForBook: OddsRow[], market: SlipMarketKey, outcome: SlipOutcomeKey): number | null {
  if (market === "1x2") {
    const home = rowsForBook.find((r) => r.outcome === "home")?.decimal_odds;
    const draw = rowsForBook.find((r) => r.outcome === "draw")?.decimal_odds;
    const away = rowsForBook.find((r) => r.outcome === "away")?.decimal_odds;
    if (home == null || draw == null || away == null) return null;
    const [pHome, pDraw, pAway] = multiplicativeNormalize([home, draw, away]);
    return outcome === "home" ? pHome : outcome === "draw" ? pDraw : outcome === "away" ? pAway : null;
  }
  if (market === "ou25" || market === "btts") {
    const [a, b] = market === "ou25" ? (["over", "under"] as const) : (["yes", "no"] as const);
    const oddsA = rowsForBook.find((r) => r.outcome === a)?.decimal_odds;
    const oddsB = rowsForBook.find((r) => r.outcome === b)?.decimal_odds;
    if (oddsA == null || oddsB == null) return null;
    const [pA, pB] = multiplicativeNormalize([oddsA, oddsB]);
    return outcome === a ? pA : outcome === b ? pB : null;
  }
  return null; // dc — see interface doc comment
}

function modelProbForSelection(prediction: FootballPrediction, market: SlipMarketKey, outcome: SlipOutcomeKey): number | null {
  if (market === "1x2") {
    if (outcome === "home") return prediction.home;
    if (outcome === "draw") return prediction.draw;
    if (outcome === "away") return prediction.away;
    return null;
  }
  if (market === "ou25") {
    if (prediction.over25 == null) return null;
    return outcome === "over" ? prediction.over25 : outcome === "under" ? 1 - prediction.over25 : null;
  }
  if (market === "btts") {
    if (prediction.btts == null) return null;
    return outcome === "yes" ? prediction.btts : outcome === "no" ? 1 - prediction.btts : null;
  }
  if (market === "dc") {
    if (outcome === "hd") return prediction.home + prediction.draw;
    if (outcome === "da") return prediction.draw + prediction.away;
    if (outcome === "ha") return prediction.home + prediction.away;
    return null;
  }
  return null;
}

async function fixtureLabel(supabase: Client, fixtureId: string): Promise<string> {
  const { data } = await supabase.from("alpha_fixtures").select("home_team, away_team, league_id, kickoff_at").eq("id", fixtureId).maybeSingle();
  if (!data) return fixtureId;
  return `${data.home_team} vs ${data.away_team} (${data.league_id})`;
}

function formatPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

export async function buildSlip(
  supabase: Client,
  userId: string,
  input: BuildSlipInput,
): Promise<BuildSlipResult | { error: string }> {
  if (input.selections.length === 0) return { error: "at least one selection is required" };

  const kFrac = input.kellyFraction ?? 0.25;
  const predictionCache = new Map<string, FootballPrediction | null>();
  const results: SlipSelectionResult[] = [];

  for (const sel of input.selections) {
    const rows = await readMarketSnapshot(supabase, sel.fixtureId, sel.market);
    if (rows.length === 0) return { error: `no odds available for fixture ${sel.fixtureId} market ${sel.market}` };

    let book: string;
    let decimalOdds: number;
    if (sel.book) {
      const row = rows.find((r) => r.book === sel.book && r.outcome === sel.outcome);
      if (!row) return { error: `no odds from book "${sel.book}" for fixture ${sel.fixtureId} ${sel.market}/${sel.outcome}` };
      book = row.book;
      decimalOdds = row.decimal_odds;
    } else {
      const candidates = rows.filter((r) => r.outcome === sel.outcome);
      if (candidates.length === 0) return { error: `no odds for outcome "${sel.outcome}" on fixture ${sel.fixtureId} ${sel.market}` };
      const best = candidates.reduce((a, b) => (b.decimal_odds > a.decimal_odds ? b : a));
      book = best.book;
      decimalOdds = best.decimal_odds;
    }

    const rowsForBook = rows.filter((r) => r.book === book);
    const marketProbRemoved = marketProbForSelection(rowsForBook, sel.market, sel.outcome);

    if (!predictionCache.has(sel.fixtureId)) {
      const predicted = await predictFixture(supabase, sel.fixtureId, "blend");
      predictionCache.set(sel.fixtureId, predicted?.prediction ?? null);
    }
    const prediction = predictionCache.get(sel.fixtureId) ?? null;
    const modelProb = prediction ? modelProbForSelection(prediction, sel.market, sel.outcome) : null;

    const edge = modelProb != null && marketProbRemoved != null ? modelProb - marketProbRemoved : null;
    const kellyStakeFraction = modelProb != null ? kellyFraction(modelProb, decimalOdds, kFrac) : null;

    results.push({
      fixtureId: sel.fixtureId,
      fixtureLabel: await fixtureLabel(supabase, sel.fixtureId),
      market: sel.market,
      outcome: sel.outcome,
      book,
      decimalOdds,
      impliedProb: 1 / decimalOdds,
      marketProbRemoved,
      modelProb,
      edge,
      kellyStakeFraction,
    });
  }

  const combinedOdds = results.reduce((acc, r) => acc * r.decimalOdds, 1);

  let bankroll: number | null = null;
  if (input.stakeTotal == null && results.length === 1 && results[0].kellyStakeFraction != null) {
    try {
      const adapter = createVenueAdapter("zoqo-sportsbook", supabase, userId);
      bankroll = (await adapter.balance()).cash;
    } catch {
      bankroll = null;
    }
  }
  const suggestedStake =
    input.stakeTotal ?? (results.length === 1 && results[0].kellyStakeFraction != null && bankroll != null ? bankroll * results[0].kellyStakeFraction : null);

  const lines: string[] = [`ZOQO Alpha slip — ${results.length} selection(s)`];
  results.forEach((r, i) => {
    const edgeStr = r.edge != null ? ` — model ${formatPct(r.modelProb!)} vs market ${formatPct(r.marketProbRemoved!)} (edge ${r.edge >= 0 ? "+" : ""}${(r.edge * 100).toFixed(1)}pt)` : "";
    lines.push(`${i + 1}. ${r.fixtureLabel} — ${r.market.toUpperCase()}: ${r.outcome} @ ${r.decimalOdds.toFixed(2)} (${r.book})${edgeStr}`);
  });
  lines.push(`Combined odds: ${combinedOdds.toFixed(2)}`);
  if (suggestedStake != null) lines.push(`Suggested stake: ₦${suggestedStake.toFixed(2)} (fractional Kelly ${kFrac})`);
  const plainText = lines.join("\n");

  const result: BuildSlipResult = { selections: results, combinedOdds, suggestedStake, plainText };

  if (input.place) {
    if (results.length !== 1) {
      return { error: "multi-leg parlay placement isn't implemented (phase-3-football.md's scope cut) — omit `place` to preview combined odds, or build a single-selection slip to place it as a paper bet" };
    }
    if (!input.strategyId) {
      return { error: "place:true requires strategyId (an existing zoqo-sportsbook strategy instance) — alpha_decisions.strategy_id is a required foreign key" };
    }
    const { data: strategy } = await supabase
      .from("alpha_strategies")
      .select("id, venue")
      .eq("id", input.strategyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!strategy) return { error: `strategy ${input.strategyId} not found for this account` };
    if (strategy.venue !== "zoqo-sportsbook") return { error: `strategy ${input.strategyId} targets venue "${strategy.venue}", not zoqo-sportsbook` };

    const sel = results[0];
    const stake = suggestedStake ?? 0;
    if (stake <= 0) return { error: "no positive stake computed for this selection — provide stakeTotal or ensure a model probability is available for Kelly sizing" };

    const marketId = `${sel.fixtureId}:${sel.market}:${sel.outcome}`;
    const adapter = createVenueAdapter("zoqo-sportsbook", supabase, userId);
    const placed = await adapter.place(
      {
        strategyId: strategy.id,
        market: { venue: "zoqo-sportsbook", marketId },
        side: "back",
        kind: "market",
        edge: sel.edge ?? 0,
        modelProb: sel.modelProb ?? undefined,
        marketProb: sel.marketProbRemoved ?? undefined,
        rationale: `Manual slip via build_slip: ${sel.market}/${sel.outcome} @ ${sel.decimalOdds} (${sel.book})`,
        features: { decimalOdds: sel.decimalOdds, book: sel.book },
      },
      stake,
      { userId, now: Date.now() },
    );

    const { data: decision } = await supabase
      .from("alpha_decisions")
      .insert({
        user_id: userId,
        strategy_id: strategy.id,
        venue: "zoqo-sportsbook",
        market_id: marketId,
        side: "back",
        status: placed.status === "rejected" ? "rejected" : "accepted",
        reject_reason: placed.status === "rejected" ? "venue rejected the order (see order log)" : null,
        edge: sel.edge,
        model_prob: sel.modelProb,
        market_prob: sel.marketProbRemoved,
        price_or_odds: sel.decimalOdds,
        stake: placed.status === "rejected" ? null : stake,
        currency: "NGN",
        rationale: `Manual slip via build_slip`,
        features: { book: sel.book } as never,
      })
      .select("id")
      .single();

    let orderId: string | null = null;
    if (decision && placed.status !== "rejected" && placed.venueOrderId) {
      const { data: order } = await supabase
        .from("alpha_orders")
        .insert({
          decision_id: decision.id,
          user_id: userId,
          venue: "zoqo-sportsbook",
          venue_order_id: placed.venueOrderId,
          market_id: marketId,
          side: "back",
          kind: "market",
          stake: placed.stake,
          currency: "NGN",
          price_or_odds: placed.priceOrOdds,
          book: sel.book,
          status: placed.status,
        })
        .select("id")
        .single();
      orderId = order?.id ?? null;
    }

    result.placed = { decisionId: decision?.id ?? "", orderId, status: placed.status };
  }

  return result;
}
