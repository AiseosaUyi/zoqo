// Chart timeframe presets. Short frames slice the live 1-minute series; long
// frames fetch coarser candles. `bands` = show the 5-min market column overlay
// (only meaningful at short ranges; long ranges become a pure sentiment chart).

export interface Timeframe {
  key: string;
  label: string;
  ms: number; // visible lookback
  interval: string; // candle granularity to fetch for long frames
  limit: number;
  bands: boolean; // overlay 5-min market bands?
  live: boolean; // use the live 1m series (no separate fetch)?
}

export const TIMEFRAMES: Timeframe[] = [
  { key: "1m", label: "1m", ms: 60_000, interval: "1m", limit: 60, bands: false, live: true },
  { key: "5m", label: "5m", ms: 5 * 60_000, interval: "1m", limit: 60, bands: true, live: true },
  { key: "15m", label: "15m", ms: 15 * 60_000, interval: "1m", limit: 60, bands: true, live: true },
  { key: "30m", label: "30m", ms: 30 * 60_000, interval: "1m", limit: 60, bands: true, live: true },
  { key: "1h", label: "1h", ms: 60 * 60_000, interval: "1m", limit: 120, bands: true, live: true },
  { key: "1D", label: "1D", ms: 24 * 3_600_000, interval: "15m", limit: 100, bands: false, live: false },
  { key: "1W", label: "1W", ms: 7 * 24 * 3_600_000, interval: "1h", limit: 180, bands: false, live: false },
  { key: "1M", label: "1M", ms: 30 * 24 * 3_600_000, interval: "1d", limit: 31, bands: false, live: false },
  { key: "All", label: "All", ms: 365 * 24 * 3_600_000, interval: "1d", limit: 365, bands: false, live: false },
];

export const TF_BY_KEY: Record<string, Timeframe> = Object.fromEntries(
  TIMEFRAMES.map((t) => [t.key, t]),
);

export const DEFAULT_TF = "1h";

/** Market durations the user can trade — the top-tab "market selector".
 *  Must mirror DURATIONS_MIN in engine.ts. */
export const MARKET_DURATIONS = [
  { key: "5m", label: "5m", ms: 5 * 60_000 },
  { key: "10m", label: "10m", ms: 10 * 60_000 },
  { key: "15m", label: "15m", ms: 15 * 60_000 },
  { key: "30m", label: "30m", ms: 30 * 60_000 },
  { key: "1h", label: "1h", ms: 60 * 60_000 },
];
export const MD_BY_KEY: Record<string, number> = Object.fromEntries(
  MARKET_DURATIONS.map((d) => [d.key, d.ms]),
);
export const DEFAULT_DURATION = "5m";

