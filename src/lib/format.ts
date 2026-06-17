// Display formatters. Prices in this app are USD; market odds in cents.

export const usd = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    ...opts,
  }).format(n);

/** Compact money for axis/volume labels: $1.2M, $18.6k. */
export function usdCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

/** BTC price like 67,500 (no cents). */
export const btc = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export const btc2 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

/** Signed BTC dollars, no cents: +$620 / −$310 (true minus glyph). */
export const signedBtc = (n: number) =>
  `${n >= 0 ? "+" : "−"}$${btc(Math.abs(n))}`;

/** Market odds: 89.9¢ */
export const cents = (n: number) => `${n.toFixed(1)}¢`;

export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export const signedUsd = (n: number) =>
  `${n >= 0 ? "+" : "-"}${usd(Math.abs(n))}`;

/** HH:MM in ET-ish local clock. */
export function hhmm(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function hhmmss(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** mm:ss countdown from a millisecond duration. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** "3s" style age. */
export function ageShort(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}
