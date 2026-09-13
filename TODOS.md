# TODOS

## Terminal — drawing tools & chart (from tester report, 2026-09-12)

Originally deferred out of the P0 auth fix per eng-review Step 0 scope split
(D1, 2026-09-13); most were then implemented directly per user request
(2026-09-13). See `## Completed` below. Remaining items still need a product
decision or further investigation before they're buildable.

### [Product decision needed] Drawing-triggered live order tracking

**What:** Whether a drawn Long/Short annotation should actually place/track a real order (wire into `terminalStore.tsx`/`terminalExecution.ts`), not just display a static box.

**Why:** The tester's literal ask ("track when market has triggered it and its moving") implies live behavior, not a static drawing. This is a new trust/risk-control surface — it would need to route through the same `maxOrderSize`/`dailyCap` enforcement `terminalExecution.ts` already centralizes for the OrderTicket path, or risk becoming a second, uncapped order-entry path.

**Context:** Needs a product conversation before any code: is "draw an order on the chart" a desired product direction at all? If yes, scope as its own plan with its own eng review — this is not a toolbar tweak. The static Long/Short annotation tool itself (no live order tracking) already shipped — see Completed.

**Effort:** XL
**Priority:** P3
**Depends on:** Product decision

### Daily/weekly/monthly timeframes (1D, 1W, 1M) — pending data investigation

**What:** Add 1D/1W/1M to the timeframe set.

**Why:** Tester request, but blocked on confirming `price_history`/candle retention — these need OHLC data reaching back much further than intraday timeframes require. `TerminalShell.tsx`'s `MAX_CANDLES` currently caps retained 1m history at 24 hours, which is enough for the intraday timeframes shipped (up to H4) but not for daily/weekly/monthly bars, which need weeks-to-months of history.

**Context:** Investigate raising `MAX_CANDLES`/`SEED_CANDLES` (memory/perf cost of a much larger seeded history) or backfilling from a real historical OHLC source, before scoping this as buildable.

**Effort:** M (pending investigation — could be L if backfill is needed)
**Priority:** P3
**Depends on:** Candle retention investigation

### More crypto pairs beyond BTC/ETH/SOL

**What:** Add additional crypto pairs.

**Why:** Tester request, but each pair needs its own exchange WS/REST wiring — the BTC price path (`useBtc.ts`)/`useAssetPrice.ts`'s crypto branch is fairly bespoke per-asset (Binance/Coinbase/Bitstamp WS feeds + `/api/crypto/[symbol]` poll fallback), unlike the generalized forex/gold Twelve Data path that just shipped 5 new pairs.

**Context:** Treat as a separate, larger ticket per asset rather than bundling with the forex/gold pair additions (already shipped — see Completed).

**Effort:** L (per pair)
**Priority:** P3
**Depends on:** None

### Colorblind-safe swatch selection + aria-labels on new drawing-tool icons

**What:** (a) Add a non-color-only indicator (checkmark/ring) to the style-panel color swatches for colorblind users. (b) Add `aria-label`s to the new icon-only drawing-tool toolbar buttons.

**Why:** Flagged in the 2026-09-13 design review (Pass 6, accessibility). (a) already shipped as part of the style panel implementation (a white dot + ring marks the selected swatch, not just a color change) — this item now just covers (b), the aria-labels for the 4 new toolbar tool buttons (horizontal-ray, long-position, short-position, path). Note: `DrawingToolbar.tsx`'s `Tooltip` wrapper provides a visible label already; confirm it's also exposed to screen readers (`aria-label` on the button itself, not just a hover tooltip) for all tools, not just the 4 new ones.

**Effort:** S
**Priority:** P2
**Depends on:** None

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

**Completed:** unreleased (2026-09-13)
