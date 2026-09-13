import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  marketModel,
  dixonColesModel,
  eloModel,
  blendModel,
  type FootballModelKey,
  type FootballPrediction,
  type OneXTwoOdds,
} from "./football/models";
import type { DixonColesFit } from "./football/dixonColes";
import { DEFAULT_HOME_ADVANTAGE } from "./football/elo";
import { DEFAULT_STARTING_ELO } from "./ratings";

/** Single source of truth for "what does model X think about fixture Y" —
 *  shared by the `predict_fixture` MCP tool (`lib/mcp/alphaTools.ts`), the
 *  `/api/alpha/fixtures` route the `/alpha` fixtures tab reads, and
 *  `slip.ts`'s per-selection model probability. Composes the already-built
 *  pure math in `football/models.ts` with whatever's actually persisted in
 *  `alpha_odds_snapshots`/`alpha_team_ratings` — never re-derives the math
 *  itself.
 *
 *  SCHEMA NOTE: see `ratings.ts`'s header — `alpha_team_ratings` has no
 *  columns for a Dixon-Coles fit's global `homeAdvantage`/`rho`, so this
 *  module reconstructs a `DixonColesFit` from stored `attack`/`defence`
 *  alone and falls back to the same neutral defaults `features/
 *  fixtureFeatures.ts` uses for the two missing fit-level terms. */

type Client = SupabaseClient<Database>;

const NEUTRAL_HOME_ADVANTAGE = 0.2;
const NEUTRAL_RHO = 0;

async function latestTeamRating(supabase: Client, teamId: string) {
  const { data } = await supabase
    .from("alpha_team_ratings")
    .select("elo, attack, defence")
    .eq("team_id", teamId)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Latest decimal odds per book for the 1X2 market, as `OneXTwoOdds[]` —
 *  `marketModel`'s expected input shape. Only books with a complete
 *  home/draw/away triple are included. */
export async function latestOneXTwoOddsByBook(supabase: Client, fixtureId: string): Promise<OneXTwoOdds[]> {
  const { data } = await supabase
    .from("alpha_odds_snapshots")
    .select("book, outcome, decimal_odds, ts")
    .eq("fixture_id", fixtureId)
    .eq("market", "1x2")
    .order("ts", { ascending: false });
  if (!data || data.length === 0) return [];

  const byBook = new Map<string, Partial<Record<"home" | "draw" | "away", number>>>();
  for (const row of data) {
    const outcome = row.outcome as "home" | "draw" | "away";
    if (outcome !== "home" && outcome !== "draw" && outcome !== "away") continue;
    const entry = byBook.get(row.book) ?? {};
    if (entry[outcome] == null) entry[outcome] = row.decimal_odds; // rows are newest-first; first hit per (book,outcome) is the latest
    byBook.set(row.book, entry);
  }

  const odds: OneXTwoOdds[] = [];
  for (const entry of byBook.values()) {
    if (entry.home != null && entry.draw != null && entry.away != null) odds.push({ home: entry.home, draw: entry.draw, away: entry.away });
  }
  return odds;
}

export interface FixturePredictionResult {
  model: FootballModelKey;
  prediction: FootballPrediction;
  marketConsensus: FootballPrediction | null;
  /** modelProb - marketProb per outcome — the same sign convention as
   *  `core/venue.ts`'s `Intent.edge`. `null` when there's no market
   *  consensus to compare against (no odds snapshots yet). */
  edgeByOutcome: { home: number; draw: number; away: number } | null;
  booksUsed: number;
}

/** Predicts a fixture's 1X2 outcome under the requested model (default
 *  `"blend"`, docs/alpha/06-football-model.md §3's betting default).
 *  Returns `null` only when the fixture itself doesn't exist or the
 *  requested model has no data to run on (e.g. `"dixon-coles"` requested
 *  for two teams with no rating history at all). */
export async function predictFixture(supabase: Client, fixtureId: string, model: FootballModelKey = "blend"): Promise<FixturePredictionResult | null> {
  const { data: fixture } = await supabase.from("alpha_fixtures").select("home_team_id, away_team_id").eq("id", fixtureId).maybeSingle();
  if (!fixture) return null;

  const booksOdds = await latestOneXTwoOddsByBook(supabase, fixtureId);
  const marketConsensus = booksOdds.length > 0 ? marketModel(booksOdds) : null;

  const [homeRating, awayRating] = await Promise.all([
    latestTeamRating(supabase, fixture.home_team_id),
    latestTeamRating(supabase, fixture.away_team_id),
  ]);

  const hasAnyStrength = homeRating?.attack != null || awayRating?.attack != null || homeRating?.defence != null || awayRating?.defence != null;
  let dcPrediction: FootballPrediction | null = null;
  if (hasAnyStrength) {
    const fit: DixonColesFit = {
      attack: {
        ...(homeRating?.attack != null ? { [fixture.home_team_id]: homeRating.attack } : {}),
        ...(awayRating?.attack != null ? { [fixture.away_team_id]: awayRating.attack } : {}),
      },
      defence: {
        ...(homeRating?.defence != null ? { [fixture.home_team_id]: homeRating.defence } : {}),
        ...(awayRating?.defence != null ? { [fixture.away_team_id]: awayRating.defence } : {}),
      },
      homeAdvantage: NEUTRAL_HOME_ADVANTAGE,
      rho: NEUTRAL_RHO,
    };
    dcPrediction = dixonColesModel(fit, fixture.home_team_id, fixture.away_team_id);
  }

  const homeElo = homeRating?.elo ?? DEFAULT_STARTING_ELO;
  const awayElo = awayRating?.elo ?? DEFAULT_STARTING_ELO;
  const eloPrediction = eloModel(homeElo + DEFAULT_HOME_ADVANTAGE - awayElo);

  let prediction: FootballPrediction | null;
  if (model === "market") {
    prediction = marketConsensus;
  } else if (model === "dixon-coles") {
    prediction = dcPrediction;
  } else if (model === "elo") {
    prediction = eloPrediction;
  } else {
    // "blend": needs both sides; degrades to whichever single side is
    // available (never fabricates the missing half), and to elo as a last
    // resort since it always has a number (a default-ELO-derived one).
    prediction = marketConsensus && dcPrediction ? blendModel(marketConsensus, dcPrediction) : (dcPrediction ?? marketConsensus ?? eloPrediction);
  }
  if (!prediction) return null;

  const edgeByOutcome = marketConsensus
    ? {
        home: prediction.home - marketConsensus.home,
        draw: prediction.draw - marketConsensus.draw,
        away: prediction.away - marketConsensus.away,
      }
    : null;

  return { model, prediction, marketConsensus, edgeByOutcome, booksUsed: booksOdds.length };
}
