import type { IndicatorId } from "./indicators";

/** Which indicators are turned on — a chart-level preference (like a real
 *  terminal's indicator template), not per-asset: an RSI(14) you turned on
 *  for BTC stays on when you switch to gold. Same plain-localStorage shape
 *  as drawings.ts, no React state to drive here either. */

const KEY = "zoqo-indicators-v1";

export function getActiveIndicators(): IndicatorId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setActiveIndicators(ids: IndicatorId[]) {
  try {
    if (ids.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // ignore — selection just won't persist across reloads this session
  }
}
