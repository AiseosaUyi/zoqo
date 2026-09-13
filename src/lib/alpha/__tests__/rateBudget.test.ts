import { describe, expect, it } from "vitest";
import { checkAndConsume } from "../rateBudget";

/** A minimal in-memory stand-in for the one table this module touches —
 *  enough to exercise the allow/deny/rollover logic without a live
 *  Postgres. Mirrors the exact `.from().select().eq()...` chain shape
 *  `rateBudget.ts` calls; not a general Supabase mock. */
function makeFakeSupabase(initial?: { window_start: string; used: number; limit_per_window: number; window_seconds: number }) {
  let row: (typeof initial extends undefined ? never : NonNullable<typeof initial>) | null = initial ?? null;

  const client = {
    from(table: string) {
      if (table !== "alpha_rate_budget") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row }),
          }),
        }),
        insert: (values: typeof initial) => ({
          select: () => ({
            single: async () => {
              row = values as never;
              return { data: row };
            },
          }),
        }),
        update: (patch: Partial<NonNullable<typeof initial>>) => {
          const chain = {
            _matchWindowStart: null as string | null,
            _maxUsed: null as number | null,
            eq(field: string, value: string) {
              if (field === "window_start") chain._matchWindowStart = value;
              return chain;
            },
            lte(_field: string, value: number) {
              chain._maxUsed = value;
              return chain;
            },
            select: () => ({
              maybeSingle: async () => {
                if (!row) return { data: null };
                if (chain._matchWindowStart != null && row.window_start !== chain._matchWindowStart) return { data: null };
                // .lte() filters on the row's CURRENT (pre-update) column
                // value — real Postgrest semantics — not the value being
                // written by this same update.
                if (chain._maxUsed != null && row.used > chain._maxUsed) return { data: null };
                row = { ...row, ...patch };
                return { data: row };
              },
            }),
          };
          return chain;
        },
      };
    },
  };
  return client as never;
}

describe("checkAndConsume", () => {
  it("seeds a fresh row and allows the first call", async () => {
    const supabase = makeFakeSupabase();
    const result = await checkAndConsume(supabase, "test-provider", { limitPerWindow: 5, windowSeconds: 3600 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("denies once the window is exhausted", async () => {
    const supabase = makeFakeSupabase({ window_start: new Date().toISOString(), used: 5, limit_per_window: 5, window_seconds: 3600 });
    const result = await checkAndConsume(supabase, "test-provider", { limitPerWindow: 5, windowSeconds: 3600 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows a call that exactly fills the remaining budget", async () => {
    const supabase = makeFakeSupabase({ window_start: new Date().toISOString(), used: 3, limit_per_window: 5, window_seconds: 3600 });
    const result = await checkAndConsume(supabase, "test-provider", { limitPerWindow: 5, windowSeconds: 3600, cost: 2 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("rolls the window forward and allows again once expired", async () => {
    const staleWindowStart = new Date(Date.now() - 7200_000).toISOString(); // 2h ago, window is 1h
    const supabase = makeFakeSupabase({ window_start: staleWindowStart, used: 5, limit_per_window: 5, window_seconds: 3600 });
    const result = await checkAndConsume(supabase, "test-provider", { limitPerWindow: 5, windowSeconds: 3600 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("respects a cost greater than 1", async () => {
    const supabase = makeFakeSupabase({ window_start: new Date().toISOString(), used: 0, limit_per_window: 10, window_seconds: 3600 });
    const result = await checkAndConsume(supabase, "test-provider", { limitPerWindow: 10, windowSeconds: 3600, cost: 4 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(6);
  });
});
