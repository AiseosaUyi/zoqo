import { describe, expect, it } from "vitest";
import { updateEloAfterResult, refitDixonColes, DEFAULT_STARTING_ELO } from "../ratings";

/** A minimal chainable/thenable stand-in for the two tables `ratings.ts`
 *  touches — enough to exercise its branching logic without a live
 *  Postgres, same "mirror the exact call chain, not a general Supabase
 *  mock" spirit as `__tests__/rateBudget.test.ts`'s fake. Every chain
 *  method after `.select()` ignores its arguments and returns itself; the
 *  canned response is picked purely by which table/column-set was
 *  selected, since these tests control the fixture data going in and don't
 *  need real filter semantics to prove `ratings.ts`'s own logic. */
function makeFakeSupabase(responses: {
  fixtureSingle?: unknown;
  fixtureList?: unknown[];
  eloByTeam?: Record<string, number | null>;
}) {
  const upsertCalls: unknown[][] = [];

  function chain(result: unknown) {
    const obj = {
      eq: () => obj,
      gte: () => obj,
      lte: () => obj,
      in: () => obj,
      not: () => obj,
      order: () => obj,
      limit: () => obj,
      maybeSingle: async () => ({ data: result }),
      single: async () => ({ data: result }),
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: Array.isArray(result) ? result : result == null ? [] : [result], error: null }),
    };
    return obj;
  }

  return {
    from(table: string) {
      return {
        select(cols: string) {
          if (table === "alpha_fixtures") {
            return cols.includes("kickoff_at") ? chain(responses.fixtureList ?? []) : chain(responses.fixtureSingle ?? null);
          }
          if (table === "alpha_team_ratings") {
            return { eq: (_field: string, teamId: string) => chain(responses.eloByTeam?.[teamId] != null ? { elo: responses.eloByTeam[teamId] } : null) };
          }
          throw new Error(`unexpected table "${table}" in this test's fake`);
        },
        upsert(rows: unknown[]) {
          upsertCalls.push(rows);
          return { then: (resolve: (v: { error: null }) => void) => resolve({ error: null }) };
        },
      };
    },
    upsertCalls,
  };
}

describe("updateEloAfterResult", () => {
  it("rejects a fixture that doesn't exist", async () => {
    const supabase = makeFakeSupabase({ fixtureSingle: null });
    const result = await updateEloAfterResult(supabase as never, "missing-fixture");
    expect(result).toEqual({ ok: false, reason: "fixture not found" });
  });

  it("rejects a fixture that hasn't finished yet", async () => {
    const supabase = makeFakeSupabase({ fixtureSingle: { home_team_id: "A", away_team_id: "B", home_goals: null, away_goals: null, status: "NS" } });
    const result = await updateEloAfterResult(supabase as never, "f1");
    expect(result.ok).toBe(false);
  });

  it("rejects a completed-status fixture with no recorded score", async () => {
    const supabase = makeFakeSupabase({ fixtureSingle: { home_team_id: "A", away_team_id: "B", home_goals: null, away_goals: 1, status: "FT" } });
    const result = await updateEloAfterResult(supabase as never, "f1");
    expect(result).toEqual({ ok: false, reason: "fixture has no recorded score" });
  });

  it("updates both teams' ELO from DEFAULT_STARTING_ELO when neither has a prior rating, and upserts one row per team", async () => {
    const supabase = makeFakeSupabase({
      fixtureSingle: { home_team_id: "TeamA", away_team_id: "TeamB", home_goals: 2, away_goals: 1, status: "FT" },
      eloByTeam: {},
    });
    const result = await updateEloAfterResult(supabase as never, "f1");
    expect(result).toEqual({ ok: true });
    expect(supabase.upsertCalls).toHaveLength(1);
    const rows = supabase.upsertCalls[0] as { team_id: string; elo: number }[];
    expect(rows).toHaveLength(2);
    const home = rows.find((r) => r.team_id === "TeamA")!;
    const away = rows.find((r) => r.team_id === "TeamB")!;
    // Home won as the (mild) favourite once home advantage is applied —
    // its rating should rise; the loser's should fall by the same amount.
    expect(home.elo).toBeGreaterThan(DEFAULT_STARTING_ELO);
    expect(away.elo).toBeLessThan(DEFAULT_STARTING_ELO);
    expect(home.elo - DEFAULT_STARTING_ELO).toBeCloseTo(DEFAULT_STARTING_ELO - away.elo, 6);
  });

  it("starts from an existing rating instead of the default when one is on record", async () => {
    const supabase = makeFakeSupabase({
      fixtureSingle: { home_team_id: "TeamA", away_team_id: "TeamB", home_goals: 0, away_goals: 0, status: "FT" },
      eloByTeam: { TeamA: 1700, TeamB: 1300 },
    });
    const result = await updateEloAfterResult(supabase as never, "f1");
    expect(result.ok).toBe(true);
    const rows = supabase.upsertCalls[0] as { team_id: string; elo: number }[];
    const home = rows.find((r) => r.team_id === "TeamA")!;
    // A big favourite (1700 vs 1300 + home adv) drawing is a mild upset for
    // them — their rating should fall, not rise.
    expect(home.elo).toBeLessThan(1700);
  });
});

describe("refitDixonColes", () => {
  it("returns a clear reason when there are no completed fixtures to fit on", async () => {
    const supabase = makeFakeSupabase({ fixtureList: [] });
    const result = await refitDixonColes(supabase as never, "league-1");
    expect(result.ok).toBe(false);
  });

  it("fits attack/defence for every team seen and upserts them in one call", async () => {
    const supabase = makeFakeSupabase({
      fixtureList: [
        { home_team_id: "A", away_team_id: "B", home_goals: 2, away_goals: 0, kickoff_at: new Date().toISOString(), season: 2026, status: "FT" },
        { home_team_id: "B", away_team_id: "C", home_goals: 1, away_goals: 1, kickoff_at: new Date().toISOString(), season: 2026, status: "FT" },
        { home_team_id: "C", away_team_id: "A", home_goals: 0, away_goals: 3, kickoff_at: new Date().toISOString(), season: 2026, status: "FT" },
      ],
    });
    const result = await refitDixonColes(supabase as never, "league-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.teamsFitted).toBe(3);
    expect(Number.isFinite(result.homeAdvantage)).toBe(true);
    expect(Number.isFinite(result.rho)).toBe(true);
    expect(supabase.upsertCalls).toHaveLength(1);
    const rows = supabase.upsertCalls[0] as { team_id: string; attack: number; defence: number }[];
    expect(rows.map((r) => r.team_id).sort()).toEqual(["A", "B", "C"]);
    for (const row of rows) {
      expect(Number.isFinite(row.attack)).toBe(true);
      expect(Number.isFinite(row.defence)).toBe(true);
    }
  });
});
