// Trading-session hours for the terminal's session-indicator overlay
// (tester report item 5). Forex/gold trade around these four major
// exchange-hour windows (UTC); crypto has no such concept (always-on
// market), so the overlay is hidden entirely for crypto assets — see
// TerminalChart.tsx's asset-class check, not anything here.

export interface SessionDef {
  key: string;
  label: string;
  /** UTC hour [0-23] the session opens. */
  startHour: number;
  /** UTC hour [0-23] the session closes — may be less than startHour
   *  (Sydney/Tokyo wrap past midnight UTC). */
  endHour: number;
  color: string;
}

/** Approximate standard market hours, UTC. Real exchanges shift by ~1h
 *  across DST changes; this is a static reference overlay, not a precise
 *  per-day feed — same tradeoff every retail platform's "sessions" widget
 *  makes. */
export const SESSIONS: SessionDef[] = [
  { key: "sydney", label: "Sydney", startHour: 22, endHour: 7, color: "#0047FF" }, // blue-500
  { key: "tokyo", label: "Tokyo", startHour: 0, endHour: 9, color: "#601FFF" }, // purple-500
  { key: "london", label: "London", startHour: 8, endHour: 17, color: "#27AE60" }, // green-500
  { key: "newyork", label: "New York", startHour: 13, endHour: 22, color: "#FF7300" }, // orange-500
];

export interface SessionBand {
  key: string;
  label: string;
  color: string;
  startSec: number;
  endSec: number;
}

const HOUR_SEC = 3600;
const DAY_SEC = 86400;

/** Session bands overlapping [fromSec, toSec] (inclusive-ish), one band per
 *  session per UTC day in range. Capped at 31 days of range — beyond that
 *  this is a zoomed-way-out view where per-session bands would be visual
 *  noise anyway, so the caller should skip rendering rather than call this
 *  with an enormous range. */
export function getSessionBandsInRange(fromSec: number, toSec: number): SessionBand[] {
  if (!(toSec > fromSec) || toSec - fromSec > 31 * DAY_SEC) return [];
  const firstDayStart = Math.floor(fromSec / DAY_SEC) * DAY_SEC - DAY_SEC; // one day early to catch overnight wraps
  const bands: SessionBand[] = [];
  for (let dayStart = firstDayStart; dayStart <= toSec; dayStart += DAY_SEC) {
    for (const s of SESSIONS) {
      const durationHours = s.endHour > s.startHour ? s.endHour - s.startHour : 24 - s.startHour + s.endHour;
      const startSec = dayStart + s.startHour * HOUR_SEC;
      const endSec = startSec + durationHours * HOUR_SEC;
      if (endSec < fromSec || startSec > toSec) continue;
      bands.push({ key: `${s.key}-${dayStart}`, label: s.label, color: s.color, startSec, endSec });
    }
  }
  return bands;
}
