/** Copy-trading replication (docs/alpha/08-copy-trading.md §3) — fill
 *  detection, sizing, and the pre-follow filters. Detection functions hit
 *  real public APIs (no key needed for either venue's read side); sizing
 *  and filtering are pure so they're unit-tested without a network. */

import type { SourceFillRecord } from "./sources";

export interface RawSourceFill {
  venueTradeId: string;
  marketId: string;
  outcomeId?: string;
  side: "buy" | "sell";
  price: number;
  sizeUsd: number;
  filledAtMs: number;
}

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

interface PolymarketActivityEntry {
  type: string;
  side?: string;
  size?: number;
  usdcSize?: number;
  price?: number;
  timestamp?: number;
  conditionId?: string;
  asset?: string;
  transactionHash?: string;
}

/** `GET /activity?user=&type=TRADE` — real, public, keyless. Returns only
 *  fills strictly after `sinceMs` (exclusive), oldest first. Never throws —
 *  a network failure degrades to `[]`, matching every other provider in
 *  this program. */
export async function detectPolymarketFills(walletAddress: string, sinceMs: number, limit = 100): Promise<RawSourceFill[]> {
  try {
    const url = `${POLYMARKET_DATA_API}/activity?user=${encodeURIComponent(walletAddress)}&limit=${limit}&type=TRADE`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = (await res.json()) as PolymarketActivityEntry[];
    const out: RawSourceFill[] = [];
    for (const e of raw) {
      if (e.type !== "TRADE" || !e.timestamp || !e.transactionHash) continue;
      const filledAtMs = e.timestamp * 1000;
      if (filledAtMs <= sinceMs) continue;
      out.push({
        venueTradeId: e.transactionHash,
        marketId: e.conditionId ?? "",
        outcomeId: e.asset,
        side: e.side?.toUpperCase() === "SELL" ? "sell" : "buy",
        price: e.price ?? 0,
        sizeUsd: e.usdcSize ?? e.size ?? 0,
        filledAtMs,
      });
    }
    return out.sort((a, b) => a.filledAtMs - b.filledAtMs);
  } catch {
    return [];
  }
}

interface ManifoldBetEntry {
  id: string;
  contractId: string;
  outcome?: string;
  amount?: number;
  probBefore?: number;
  createdTime?: number;
}

/** `GET /v0/bets?username=` — real, public, keyless. Same never-throws/
 *  since-filter contract as `detectPolymarketFills`. */
export async function detectManifoldFills(username: string, sinceMs: number, limit = 100): Promise<RawSourceFill[]> {
  try {
    const url = `https://api.manifold.markets/v0/bets?username=${encodeURIComponent(username)}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const raw = (await res.json()) as ManifoldBetEntry[];
    const out: RawSourceFill[] = [];
    for (const b of raw) {
      const filledAtMs = b.createdTime ?? 0;
      if (!filledAtMs || filledAtMs <= sinceMs) continue;
      out.push({
        venueTradeId: b.id,
        marketId: b.contractId,
        side: b.outcome === "NO" ? "sell" : "buy",
        price: b.probBefore ?? 0.5,
        sizeUsd: Math.abs(b.amount ?? 0),
        filledAtMs,
      });
    }
    return out.sort((a, b) => a.filledAtMs - b.filledAtMs);
  } catch {
    return [];
  }
}

interface PolymarketLeaderboardEntry {
  proxyWallet: string;
  pseudonym?: string;
}

/** `GET https://lb-api.polymarket.com/profit?window=all&limit=` — real,
 *  public, keyless leaderboard (verified live 2026-09-14: real wallets,
 *  real profit figures — e.g. the top wallet at time of writing has $23.6M
 *  lifetime profit). Feeds `propose_copy_sources`' candidate discovery. */
export async function discoverPolymarketCandidates(limit = 20): Promise<string[]> {
  try {
    const res = await fetch(`https://lb-api.polymarket.com/profit?window=all&limit=${limit}`);
    if (!res.ok) return [];
    const raw = (await res.json()) as PolymarketLeaderboardEntry[];
    return raw.map((r) => r.proxyWallet).filter(Boolean);
  } catch {
    return [];
  }
}

/** Manifold's public REST API has NO profit-ranked leaderboard endpoint —
 *  verified live 2026-09-14: `/v0/leaderboards` 404s, and the documented
 *  endpoint list (docs.manifold.markets/api) has no leaderboard route at
 *  all; `/v0/users` exists but returns users in signup order with no
 *  profit sort. Manifold's own website leaderboard is presumably powered
 *  by an internal, undocumented endpoint this program has no business
 *  guessing at. Real candidate discovery for Manifold is manual — `service.
 *  proposeCopySources` accepts an explicit `candidateRefs` override for
 *  exactly this reason (Aise names a known-good username), and this
 *  function returns `[]` honestly rather than faking a "top traders" list
 *  from an unranked user dump. */
export async function discoverManifoldCandidates(): Promise<string[]> {
  return [];
}

export interface SizeCopyIntentInput {
  sourceFillSizeUsd: number;
  sourceBankrollUsd: number;
  strategyBudget: number;
  maxStake: number;
}

/** Proportional-to-bankroll-fraction sizing (§3 "Sizing") — never mirrors
 *  absolute size. Zero/invalid bankroll sizes to 0 rather than dividing by
 *  zero or blowing up to the full budget. */
export function sizeCopyIntent(input: SizeCopyIntentInput): number {
  if (input.sourceBankrollUsd <= 0) return 0;
  const fraction = Math.max(0, Math.min(1, input.sourceFillSizeUsd / input.sourceBankrollUsd));
  return Math.min(fraction * input.strategyBudget, input.maxStake);
}

export interface FollowFilterInput {
  timeToResolutionMs: number;
  minTimeToResolutionMs: number;
  priceMovedSinceFillPct: number; // absolute value, 0..1
  maxPriceMovedPct: number;
  liquidityAtSizeUsd: number;
  minLiquidityUsd: number;
  alreadyHoldMarket: boolean;
}

export interface FollowDecision {
  follow: boolean;
  reason?: string;
}

/** Pre-follow filters (§3) — checked in the order the spec lists them so
 *  the first failing reason is the most legible one for a rejected
 *  decision's log. */
export function shouldFollowFill(input: FollowFilterInput): FollowDecision {
  if (input.alreadyHoldMarket) return { follow: false, reason: "already_hold_market" };
  if (input.timeToResolutionMs < input.minTimeToResolutionMs) return { follow: false, reason: "too_close_to_resolution" };
  if (input.priceMovedSinceFillPct > input.maxPriceMovedPct) return { follow: false, reason: "price_already_moved" };
  if (input.liquidityAtSizeUsd < input.minLiquidityUsd) return { follow: false, reason: "insufficient_liquidity" };
  return { follow: true };
}

export interface SlippageInput {
  sourceFillPrice: number;
  ourFillPrice: number;
}

/** Signed slippage in basis points — positive means we paid worse than the
 *  source (normal, since we're always later); stored verbatim on
 *  `alpha_decisions.slippage_bps`. */
export function computeSlippageBps(input: SlippageInput): number {
  if (input.sourceFillPrice <= 0) return 0;
  return ((input.ourFillPrice - input.sourceFillPrice) / input.sourceFillPrice) * 10_000;
}

/** Converts a raw detected fill into the `SourceFillRecord` shape
 *  `sources.ts`'s screen scores against — unresolved (no outcome yet) by
 *  default; the caller backfills `resolved`/`won`/`pnl` once the source's
 *  market settles (same "never backfill from hindsight before it's real"
 *  discipline the rest of this program follows). */
export function rawFillToSourceRecord(fill: RawSourceFill): SourceFillRecord {
  return {
    filledAt: fill.filledAtMs,
    marketId: fill.marketId,
    side: fill.side,
    priceAtEntry: fill.price,
    sizeUsd: fill.sizeUsd,
    resolved: false,
  };
}
