import { createServiceRoleClient } from "@/lib/supabase/server";

/** Cross-venue prediction-market question matching (docs/alpha/03-architecture.md
 *  §4's `alpha_market_links` table, docs/alpha/plans/phase-4-extra-venues.md).
 *  Phase 4 is the first phase with 2+ prediction-market venues (Manifold,
 *  Kalshi) to match against each other, so this is that matching job's
 *  first cut.
 *
 *  THIS IS DELIBERATELY NOT AN ENTITY-RESOLUTION SYSTEM. It is a
 *  normalized-string token-overlap heuristic — lowercase, strip
 *  punctuation, split on whitespace, compare token sets — with no ML, no
 *  embeddings, no external API. "Will the Fed cut rates in September?" and
 *  "Fed September rate cut?" score well; two differently-worded questions
 *  about genuinely different events can still collide if their token sets
 *  happen to overlap. That's why every link this module writes to
 *  `alpha_market_links` is inserted with `confirmed = false` — the schema's
 *  own column exists precisely so a human (or a future, better matcher) can
 *  promote a link to trusted later; nothing here ever sets it to `true`.
 *  Treat this as a reasonable, functional, first-cut version, not a
 *  production-grade matcher. */

export interface MatchCandidate {
  marketId: string;
  question: string;
}

export interface MatchResult {
  candidate: MatchCandidate;
  score: number;
}

/** Lowercase, strip everything but word characters and whitespace, collapse
 *  whitespace, trim. Exported so `alpha_market_links.canonical` is always
 *  written/read through the exact same normalization. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeQuestion(text).split(" ").filter(Boolean));
}

/** Overlap coefficient (intersection / smaller set size), not Jaccard —
 *  deliberately robust to a short Kalshi ticker title being compared
 *  against a longer, more verbose Manifold question about the same event;
 *  Jaccard would penalize the length mismatch even on a clean match. */
export function tokenOverlapRatio(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.min(ta.size, tb.size);
}

/** Overlap ratio at or above this is treated as "confident enough to act
 *  on" by a strategy (still `confirmed: false` in the DB either way — see
 *  module header). Below it, callers should treat the questions as
 *  unrelated. */
export const MATCH_THRESHOLD = 0.6;

/** Best-scoring candidate for `question`, or `null` if `candidates` is
 *  empty. Callers compare `.score` against `MATCH_THRESHOLD` themselves —
 *  this always returns the best available match even when it's a poor one,
 *  same "let the caller decide what's actionable" convention as
 *  `bestPrice()` in zoqoSportsbook.ts. */
export function bestMatch(question: string, candidates: MatchCandidate[]): MatchResult | null {
  let best: MatchResult | null = null;
  for (const candidate of candidates) {
    const score = tokenOverlapRatio(question, candidate.question);
    if (!best || score > best.score) best = { candidate, score };
  }
  return best;
}

/** A handful of Manifold's own currently-listed binary markets, with their
 *  live probability, to match against. This intentionally duplicates a thin
 *  slice of manifold.ts's plain-`fetch` pattern (no auth needed — Manifold's
 *  `/v0/markets` listing is public) rather than importing from manifold.ts:
 *  that file's exports (`createManifoldAdapter(ForUser)`,
 *  `intentSideToOutcome`, `estimateSettlementPnl`) don't expose question
 *  text alongside a marketId, and widening a Phase 2 file's surface for one
 *  Phase 4 strategy's matching need isn't worth the touch. If a second
 *  caller needs the same thing, factor this back into manifold.ts then.
 *  Never throws — network failure degrades to `[]`. */
export async function fetchManifoldCandidates(limit: number): Promise<(MatchCandidate & { probability: number })[]> {
  try {
    const res = await fetch(`https://api.manifold.markets/v0/markets?limit=${Math.min(Math.max(limit, 1) * 2, 500)}`);
    if (!res.ok) return [];
    const markets = (await res.json()) as { id?: string; question?: string; probability?: number; isResolved?: boolean }[];
    return markets
      .filter((m) => m.id && m.question && typeof m.probability === "number" && !m.isResolved)
      .map((m) => ({ marketId: m.id!, question: m.question!, probability: m.probability! }))
      .slice(0, limit);
  } catch {
    return [];
  }
}

type MarketLinksClient = ReturnType<typeof createServiceRoleClient>;

/** Writes (or leaves alone, on conflict) one `alpha_market_links` row for
 *  `(venue, marketId)` under `canonical`. `alpha_market_links` has a unique
 *  constraint on `(venue, market_id)` (supabase/schema.sql), so this is a
 *  plain upsert keyed on that constraint — re-running the matching job
 *  against the same market is idempotent. Never throws: a Supabase error
 *  (including no DB reachable in an environment with no Supabase project
 *  configured, which is expected in this sandbox) is swallowed and logged
 *  to the console rather than crashing the calling strategy's evaluate(). */
export async function upsertMarketLink(canonical: string, venue: string, marketId: string, client?: MarketLinksClient): Promise<void> {
  try {
    const supabase = client ?? createServiceRoleClient();
    await supabase.from("alpha_market_links").upsert({ canonical, venue, market_id: marketId, confirmed: false }, { onConflict: "venue,market_id" });
  } catch (e) {
    console.error("marketMatching.upsertMarketLink failed (non-fatal, link not persisted)", e);
  }
}

/** Reads every OTHER venue's `alpha_market_links` row sharing `canonical` —
 *  "what has already been linked to this same normalized question." Returns
 *  `[]` (never throws) on any failure, same reasoning as `upsertMarketLink`. */
export async function findCrossVenueLinks(canonical: string, excludeVenue: string, client?: MarketLinksClient): Promise<{ venue: string; marketId: string }[]> {
  try {
    const supabase = client ?? createServiceRoleClient();
    const { data } = await supabase.from("alpha_market_links").select("venue, market_id").eq("canonical", canonical).neq("venue", excludeVenue);
    return (data ?? []).map((r) => ({ venue: r.venue, marketId: r.market_id }));
  } catch (e) {
    console.error("marketMatching.findCrossVenueLinks failed (non-fatal, treated as no links)", e);
    return [];
  }
}
