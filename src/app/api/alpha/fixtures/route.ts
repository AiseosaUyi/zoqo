import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { predictFixture } from "@/lib/alpha/predictFixture";

export const dynamic = "force-dynamic";

/** Session-scoped read for the `/alpha` fixtures tab
 *  (docs/alpha/03-architecture.md §9): upcoming fixtures with the blend
 *  model's prediction, the market consensus, and edge per outcome —
 *  exactly what `predictFixture.ts` returns, fetched once per fixture. Thin
 *  wrapper, same shape as every other `/api/alpha/*` route: auth check,
 *  then a call into a `src/lib/alpha/*` function, no business logic here. */

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit = Math.min(Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT, 1), MAX_LIMIT);
  const league = searchParams.get("league") ?? undefined;

  let query = supabase
    .from("alpha_fixtures")
    .select("id, league_id, season, kickoff_at, home_team, away_team, status")
    .gte("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(limit);
  if (league) query = query.eq("league_id", league);

  const { data: fixtures } = await query;

  const rows = await Promise.all(
    (fixtures ?? []).map(async (f) => {
      const predicted = await predictFixture(supabase, f.id, "blend");
      return {
        ...f,
        prediction: predicted?.prediction ?? null,
        marketConsensus: predicted?.marketConsensus ?? null,
        edgeByOutcome: predicted?.edgeByOutcome ?? null,
        booksUsed: predicted?.booksUsed ?? 0,
      };
    }),
  );

  return NextResponse.json(rows);
}
