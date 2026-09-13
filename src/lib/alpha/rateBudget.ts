import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/** Per-provider token bucket over `alpha_rate_budget` (docs/alpha/03-
 *  architecture.md §3, docs/alpha/06-football-model.md §1) — every external
 *  HTTP call the ingest job makes goes through `checkAndConsume` first, so
 *  a buggy strategy or a burst of ingest work can't burn a free-tier quota
 *  (odds-api.io: 100/hr, API-Football: 100/day) in one run.
 *
 *  Race-safety: the same `UPDATE ... WHERE <still valid> RETURNING` pattern
 *  `runner.ts` uses for claiming strategies — a single UPDATE statement
 *  takes a row lock for its duration, so two overlapping ingest
 *  invocations can't both consume the last token; the second one's UPDATE
 *  re-evaluates its WHERE clause against the first one's already-committed
 *  `used` value and correctly fails if the budget is now exhausted. */

type Client = SupabaseClient<Database>;

export interface RateBudgetResult {
  allowed: boolean;
  remaining: number;
  /** ms until the current window rolls over — useful for the ingest job to
   *  decide whether to wait or just skip this pass's remaining work. */
  resetInMs: number;
}

async function ensureRow(
  supabase: Client,
  provider: string,
  limitPerWindow: number,
  windowSeconds: number,
): Promise<{ window_start: string; used: number; limit_per_window: number; window_seconds: number }> {
  const { data } = await supabase.from("alpha_rate_budget").select("*").eq("provider", provider).maybeSingle();
  if (data) return data;
  const fresh = { provider, window_start: new Date().toISOString(), used: 0, limit_per_window: limitPerWindow, window_seconds: windowSeconds };
  const { data: inserted } = await supabase.from("alpha_rate_budget").insert(fresh).select("*").single();
  return inserted ?? fresh;
}

const MAX_RACE_RETRIES = 3;

/** Attempts to consume `cost` tokens (default 1) from `provider`'s budget.
 *  Rolls the window forward first if it's expired. Returns `allowed:false`
 *  without consuming anything if there isn't enough room — caller must not
 *  make the external call in that case. `limitPerWindow`/`windowSeconds`
 *  are only used to seed a brand-new row; an existing row's own stored
 *  values win (so changing the constant in code doesn't silently reset an
 *  in-flight window's limit out from under it — a deliberate choice, not
 *  an oversight). Bounded retry (`attempt`, internal) against real
 *  concurrent-write races — fails closed (denies) rather than loop
 *  unboundedly or risk over-consumption. */
export async function checkAndConsume(
  supabase: Client,
  provider: string,
  opts: { limitPerWindow: number; windowSeconds: number; cost?: number },
  attempt = 0,
): Promise<RateBudgetResult> {
  if (attempt >= MAX_RACE_RETRIES) {
    // Exhausted retries against real concurrent contention — fail closed
    // (deny the call) rather than risk an unbounded loop or a silent
    // over-consumption.
    return { allowed: false, remaining: 0, resetInMs: opts.windowSeconds * 1000 };
  }
  const cost = opts.cost ?? 1;
  const row = await ensureRow(supabase, provider, opts.limitPerWindow, opts.windowSeconds);

  const windowStartMs = new Date(row.window_start).getTime();
  const windowMs = row.window_seconds * 1000;
  const now = Date.now();
  const expired = now - windowStartMs >= windowMs;

  if (expired) {
    // Roll the window forward. This UPDATE is itself the atomic guard: if
    // another invocation already rolled it forward, ours matches zero rows
    // (window_start no longer equals what we read) and we just re-read.
    const { data: rolled } = await supabase
      .from("alpha_rate_budget")
      .update({ window_start: new Date(now).toISOString(), used: cost })
      .eq("provider", provider)
      .eq("window_start", row.window_start)
      .select("*")
      .maybeSingle();
    if (rolled) return { allowed: true, remaining: rolled.limit_per_window - rolled.used, resetInMs: windowMs };
    return checkAndConsume(supabase, provider, opts, attempt + 1); // lost the roll race — retry against the fresh window
  }

  if (row.used + cost > row.limit_per_window) {
    return { allowed: false, remaining: Math.max(0, row.limit_per_window - row.used), resetInMs: windowStartMs + windowMs - now };
  }

  const { data: updated } = await supabase
    .from("alpha_rate_budget")
    .update({ used: row.used + cost })
    .eq("provider", provider)
    .eq("window_start", row.window_start)
    .lte("used", row.limit_per_window - cost)
    .select("*")
    .maybeSingle();
  if (!updated) {
    // Lost a race to a concurrent consumer between our read and this
    // UPDATE — re-check rather than assume failure.
    return checkAndConsume(supabase, provider, opts, attempt + 1);
  }
  return { allowed: true, remaining: updated.limit_per_window - updated.used, resetInMs: windowStartMs + windowMs - now };
}
