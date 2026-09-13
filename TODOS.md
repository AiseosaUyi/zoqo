# TODOS

## Terminal — drawing tools & chart (from tester report, 2026-09-12)

Originally deferred out of the P0 auth fix per eng-review Step 0 scope split
(D1, 2026-09-13); most were then implemented directly per user request
(2026-09-13). A second pass (2026-09-13, same day, "let's finish up all")
shipped the drawing-triggered live order tracking item below and
investigated the remaining two. See `## Completed` below.

### Daily/weekly/monthly timeframes (1D, 1W, 1M) — investigated, not yet built

**What:** Add 1D/1W/1M to the timeframe set.

**Why:** Tester request, but blocked on confirming candle retention — these
need OHLC data reaching back much further than intraday timeframes require.
`TerminalShell.tsx`'s `MAX_CANDLES` caps retained 1m history at 24 hours
(enough for the intraday timeframes shipped, up to H4, but not daily+).

**Investigation findings (2026-09-13):** Raising `MAX_CANDLES`/`SEED_CANDLES`
to cover weeks/months of 1-minute candles is the wrong direction (memory —
tens of thousands of candles per asset just to group them down into a few
daily bars). A real historical-data path already exists and is unused by
`/terminal`: **`src/app/api/btc/history/route.ts`** fetches genuine OHLC
history for BTC (Binance klines → Coinbase → Bitstamp → CoinGecko fallback
chain, same pattern as everywhere else in this codebase) and already accepts
`interval=1d` — `/trade`'s `useChartSeries` (`src/lib/useBtc.ts`'s
`fetchHistory`) is the only current caller. The right design: (1) generalize
`fromBinance`/`fromBitstamp`/`fromCoinGecko` in that route to take an asset
param instead of hardcoding BTCUSDT/btcusd/bitcoin (Binance: ETHUSDT/SOLUSDT;
Bitstamp: ethusd/solusd; CoinGecko: ids already mapped in
`serverPriceFeed.ts`'s `COINGECKO_ID`) so ETH/SOL get real history too; (2)
for forex/gold/silver, TwelveData's `time_series` endpoint (same env var,
`TWELVE_DATA_API_KEY`, already used for live quotes in `serverPriceFeed.ts`)
supports real `interval=1day` history — needs the same "labeled mock
fallback when the key is absent" pattern the rest of that file already uses;
(3) fetch real daily bars once per asset (e.g. last ~400 days) and derive
1W/1M by grouping them into calendar-aligned week/month buckets client-side
(a new `groupCalendarCandles` helper, distinct from `candles.ts`'s existing
minute-bucket `groupCandles`) rather than fetching three separate ranges.
This keeps 1D/1W/1M genuinely real (not synthetic backfill), consistent with
this app's "real anchor" convention elsewhere, and reuses the existing
multi-source fallback chains instead of inventing a new one.

**Effort:** L (new/generalized API route + client-side calendar grouping +
wiring into `TerminalChart`'s timeframe switch)
**Priority:** P3
**Depends on:** None — investigation above is enough to scope a build

### More crypto pairs beyond BTC/ETH/SOL

**Status (2026-09-13): scoped, and turned out much smaller than originally estimated — 2 pairs (XRP, DOGE) shipped, see Completed.**

**What was assumed:** each pair needs "bespoke exchange WS/REST wiring."

**What's actually true, on inspection:** `useAssetPrice.ts`'s crypto branch and `serverPriceFeed.ts`'s `getCryptoPrice` are both already generalized over any asset — there's no per-asset code path, only per-asset **config**. Adding a pair is: (1) an `assets.ts` entry with `ws: { binance: "<sym>usdt@trade", coinbase: "<SYM>-USD" }` (Binance/Coinbase use standard, predictable symbol formats for any listed coin); (2) a `COINGECKO_ID` entry in `serverPriceFeed.ts` (Bitstamp's pair name already matches the asset's own `id`, e.g. `xrpusd`, no separate mapping needed); (3) a `HISTORY_VOL` entry in `candles.ts` for seed volatility. The one real per-asset **verification** step (not code) is confirming Bitstamp actually lists that pair (`https://www.bitstamp.net/api/v2/ticker/<pair>/`) — not every coin is, so check before adding.

**Remaining candidates** (Bitstamp-verified reachable as of 2026-09-13, not yet added): ADA/USD (`adausd`). Binance/Coinbase symbol formats are standard enough to assume support without per-pair verification, but confirm before shipping if adding a less-common coin.

**Effort:** S per pair (was overestimated as L)
**Priority:** P3
**Depends on:** None

## Investigate — not part of this session's scope (2026-09-13)

### Candle history doesn't fully seed on some page loads

**What:** On at least one clean `next start` production-server session (no drawings, no other state), `/terminal`'s chart repeatedly rendered only ~1 candle instead of the ~8-hour synthetic backfill `seedCandles1m`/`SEED_CANDLES` (`TerminalShell.tsx`) should produce on first price tick — reproduced across multiple fresh page loads and fresh browser tabs, with zero console errors.

**Why it matters:** `seedCandles1m` is a pure, deterministic function of `(assetId, anchorPrice, nowMs, count)` — nothing about it should be able to produce only 1 candle from `count=480`. If real, this would affect every timeframe, not just the 1D/1W/1M work above.

**Why this wasn't root-caused today:** found late, while browser-verifying the drawing-triggered order feature below; a focused re-read of `TerminalShell.tsx`'s `candlesByAsset` state-adjustment block didn't surface an obvious cause, and further live debugging would have required more browser-automation time than remained in scope. Not caused by this session's code changes — reproduced identically on a totally clean tab with zero drawing/order state, before and unrelated to any of today's edits.

**Context:** Next session should try to reproduce with a normal `npm run dev`/manual browser session (not the CDP-driven automation used today — see the gotcha below) before assuming it's automation-specific; if it reproduces under normal manual use too, it's a real regression worth bisecting.

**Effort:** Unknown (investigation only, not yet started)
**Priority:** P1 if it reproduces under normal manual use (core chart experience); P4 if automation-specific

## Completed (2026-09-13)

The following were originally scoped as separate deferred plans but were
implemented directly per explicit user request ("finish all the plans from
p0 to the end"). Verified via typecheck, lint, production build, the new
Playwright E2E suite, and manual browser testing (screenshots + DOM
inspection) on `/terminal`.

- **Rectangle style editor + resize handles** — `DrawingStylePanel.tsx`: color swatches (7 PALETTE colors), stroke width (thin/medium/thick), fill opacity slider, delete/close. Floating, anchored to the selected shape, edge-aware flip. Resize itself was already provided natively by `lightweight-charts-drawing`'s `DrawingManager` (confirmed, no code needed).
- **Long/Short position annotation tool** — exposed via `DrawingToolbar.tsx`'s `DRAWING_TOOLS` (visual-only, no live order tracking — see the still-open product-decision item above).
- **Horizontal-ray and path drawing tools** — added to `DRAWING_TOOLS`.
- **Trading session indicator overlay** — `TradingSessionOverlay.tsx` + `src/lib/tradingSessions.ts`; forex/gold only, hidden on crypto. Verified rendering (correct color/position/label) via DOM inspection in the browser.
- **Fractal indicator + generalized EMA periods** — `src/lib/indicators.ts`: Bill Williams 5-bar fractal (rendered as chart markers via `createSeriesMarkers`), EMA periods 9/30/50/100/200 replacing the old fixed 20/50. Verified visually (fractal arrows render correctly on BTC/USD M1).
- **More intraday timeframes (3m, 45m, 2H, 4H)** — added to `CANDLE_TIMEFRAMES`; segmented control wrapped in a horizontal-scroll container since 9 timeframes don't always fit the panel width (same fix pattern as a prior terminal toolbar overflow bug).
- **More forex/gold asset pairs** — added AUD/USD, USD/CAD, USD/CHF, NZD/USD (forex) and XAG/USD/Silver (metals) to `assets.ts`, `serverPriceFeed.ts` (Twelve Data symbols + mock fallback prices), and `candles.ts` (seed volatility).
- **Aria-labels on all drawing-tool toolbar buttons** — `DrawingToolbar.tsx`'s `ToolButton` now sets `aria-label`/`aria-pressed` on the underlying `<button>` (previously only a hover `Tooltip`, not exposed to screen readers) — covers all 15 tools plus cursor/delete/clear-all, not just the 4 new ones from the prior pass.

## Completed (2026-09-13, second pass — "let's finish up all")

- **Drawing-triggered live order tracking** — a drawn Long/Short position box (`DrawingToolbar.tsx`'s `long-position`/`short-position` tools) now becomes a real, capped resting order, not just a static annotation. `lightweight-charts-drawing`'s `LongPosition`/`ShortPosition` shapes already carry real entry/stop/target anchors (`getPositionInfo()`) — new `PositionOrderPanel.tsx` (same floating/anchored pattern as `DrawingStylePanel.tsx`) shows them plus a size input, and `TerminalChart.tsx` auto-selects a long/short shape the instant it's drawn so the panel appears immediately. Placing the order calls `terminalStore.tsx`'s existing `placeLimitOrder` — the exact same `MAX_POSITION_PCT`-capped path a human's Limit order in `OrderTicket` already goes through, so this is not a second, uncapped order-entry surface as flagged in the original product-decision item. Once placed, the existing per-tick `checkLimitOrders`/`checkStops` loop (`TerminalShell.tsx`) tracks it live with **no new evaluator code** — it fills and can hit stop/target exactly like a manually-placed Limit order. Cancelling from the panel cancels the real order (`cancelOrder`) and removes the drawing so a dead box can't look live. `placeLimitOrder`'s return type changed from `boolean` to `string | false` (the new order id, so the chart can remember which order a drawing is tracking) — the one other caller (`OrderTicket`'s flow in `TerminalShell.tsx`) was updated accordingly.
  - **Verification:** typecheck/lint/production build/Playwright all clean. Full click-to-draw browser verification was **not achieved this session** — see the candle-seeding item above; separately, automated clicks on the chart canvas didn't register anchors at all in this environment, reproduced identically on the pre-existing, previously-human-verified Rectangle tool (not something this change broke). Verified instead via: (a) tracing every type/API against the installed library's actual `.d.ts` and compiled registry source (`requiredAnchors: 3` confirmed for both position tools); (b) injecting a valid `SerializedDrawing` directly into `localStorage`'s `zoqo-drawings-v1` (the same code path the app uses to restore drawings on load) to exercise rendering. **Recommend a manual test** (real mouse, not automation) before relying on this in production: select Long Position, click 3 points (entry, stop, target), confirm the panel appears and Place/Cancel work.
- **XRP/USD and DOGE/USD crypto pairs** — added to `assets.ts` (Binance/Coinbase WS config), `serverPriceFeed.ts` (`COINGECKO_ID`), and `candles.ts` (seed volatility). Bitstamp pair availability verified directly (`xrpusd`/`dogeusd` both live) before adding — see the crypto-pairs item above for the corrected (much smaller than originally estimated) per-pair effort.

**Completed:** unreleased (2026-09-13)
