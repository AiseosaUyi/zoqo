// Seeded RNG + small numeric helpers used by the simulation engine.

/** Mulberry32 — fast, seedable PRNG so each session feels fresh but is coherent. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  let p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  p = z > 0 ? 1 - p : p;
  return p;
}

/** Box-Muller standard normal from a uniform RNG. */
export function gaussian(rng: Rng): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pick a random element. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Exponential inter-arrival time (ms) for a Poisson process of `ratePerSec`. */
export function exponentialMs(rng: Rng, ratePerSec: number): number {
  return (-Math.log(1 - rng()) / ratePerSec) * 1000;
}

/** Sample stdev of 1-step log returns from a price series (per-step volatility). */
export function realizedVol(prices: number[]): number {
  if (prices.length < 3) return 0.0008; // ~0.08%/min fallback
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) rets.push(Math.log(prices[i] / prices[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  return Math.max(1e-5, Math.sqrt(variance));
}
