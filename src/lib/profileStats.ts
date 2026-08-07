// Derived trader-profile stats — all computed from real store state
// (tradeHistory / positions). Nothing here is seeded or fabricated; a brand
// new profile with empty history produces all-zero output by construction.
import type { HistoryEntry, Position } from "./types";

export interface DayStat {
  pnl: number;
  volume: number;
  count: number;
}

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function dayStatKey(year: number, month: number, day: number) {
  return `${year}-${month}-${day}`;
}

/** Group closed/settled trades by local calendar day, for the heatmap. */
export function groupByDay(entries: HistoryEntry[]): Map<string, DayStat> {
  const map = new Map<string, DayStat>();
  for (const e of entries) {
    const key = dayKey(e.closedAt);
    const prev = map.get(key) ?? { pnl: 0, volume: 0, count: 0 };
    const vol = (e.shares * e.entryPrice) / 100;
    map.set(key, { pnl: prev.pnl + e.pnl, volume: prev.volume + vol, count: prev.count + 1 });
  }
  return map;
}

/** Notional staked across closed trades (shares * entry price) — the real
 *  "cost basis" volume for settled/closed history. */
export function historyVolume(entries: HistoryEntry[]): number {
  return entries.reduce((s, e) => s + (e.shares * e.entryPrice) / 100, 0);
}

/** Longest run of consecutive wins in chronological order. A loss or an
 *  early-closed trade both break the streak. */
export function longestWinStreak(entries: HistoryEntry[]): number {
  const chron = [...entries].sort((a, b) => a.closedAt - b.closedAt);
  let max = 0;
  let cur = 0;
  for (const e of chron) {
    if (e.result === "won") {
      cur += 1;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

/** Realized P&L for entries closed on today's local calendar date, plus a
 *  cumulative running-total series (oldest→newest) for a sparkline. */
export function todaysPnl(entries: HistoryEntry[], now = Date.now()) {
  const key = dayKey(now);
  const todays = entries
    .filter((e) => dayKey(e.closedAt) === key)
    .sort((a, b) => a.closedAt - b.closedAt);
  let running = 0;
  const points = todays.map((e) => (running += e.pnl));
  return { total: running, points };
}

/** Distinct markets touched — closed trades (joined by label+strike, since
 *  HistoryEntry has no marketId) plus any still-open positions. */
export function distinctMarkets(entries: HistoryEntry[], positions: Position[] = []): number {
  const set = new Set<string>();
  for (const e of entries) set.add(`${e.label}|${e.strike}`);
  for (const p of positions) set.add(p.marketId);
  return set.size;
}
