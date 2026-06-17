# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The line above is not decoration: this is **Next.js 16.2.9 + React 19**. Conventions differ from older Next.js. Before writing framework code, read the relevant guide under `node_modules/next/dist/docs/`.

## Commands

```bash
npm run dev      # dev server on http://localhost:3000 (Turbopack)
npm run build    # production build
npm run lint     # eslint (flat config, eslint-config-next)
```

There is **no test framework** configured — no `npm test`, no test files. Verify changes by running the app and exercising it in the browser.

Path alias: `@/*` → `src/*`.

## What this is

ZOQO is a **simulated** real-time Bitcoin prediction market ("bet Up or Down on the next 5 minutes"). It is play-money: there is no backend trading. A **real** BTC price feed drives a **client-side simulation** of rolling markets, order flow, odds, and an order book. Every session is seeded differently but behaves coherently.

## Architecture (the parts that span files)

The whole app is one client-side data pipeline. Understand this flow before changing trading behavior:

```
useBtc (real BTC price)  →  ZoqoProvider (store.tsx, ticks @600ms)  →  MarketEngine (engine.ts)  →  EngineSnapshot  →  React components
```

- **`src/lib/useBtc.ts`** — gets live BTC price. Tries WebSockets (Binance → Coinbase → Bitstamp) and **falls back to polling `/api/btc/price`** when sockets are blocked. The API route (`src/app/api/btc/*`) proxies Bitstamp/CoinGecko server-side. **In many local/sandboxed environments Binance & Coinbase are DNS-blocked, so the working sources are Bitstamp/CoinGecko via the poll fallback** — a console warning about failed WS connections is expected, not a bug.

- **`src/lib/engine.ts`** (`MarketEngine`) — the simulation. From the real price it synthesizes: rolling markets per duration (`DURATIONS_MIN = [5,10,15,30,60]`), implied YES odds (Bachelier/normal approximation of price-vs-strike, nudged by order-flow imbalance), a Poisson retail trade tape with occasional whale spikes, volume buckets, and an order book. Markets are generated `N_PAST`(12) back + live + `N_FUTURE`(1) ahead per duration; pruned after ~6h. `step(now, price)` advances everything; `snapshot()` returns an immutable `EngineSnapshot`. **Settled markets freeze their `lastPrice`/`changePct`/`settledUp` at settlement — do not recompute them against the live price** (a past bug did this and made settled columns show the current price).

- **`src/lib/store.tsx`** (`ZoqoProvider` + `useZoqo`) — the single source of app state. Owns the engine instance, runs the 600ms tick loop, holds the price series, and manages the **wallet** (cash, positions, open orders, trade history, deposit faucet) persisted to `localStorage` (`zoqo-wallet-v1`). All trading actions (`buy`, `sell`, `placeLimitOrder`, `quote`, `getMarket`, `deposit`) live here. Components read everything via `useZoqo()`; they never touch the engine directly.

- **`src/lib/types.ts`** — the domain model shared by engine, store, and UI (`Market`, `Position`, `Trade`, `Spike`, `OrderBook`, `EngineSnapshot`, etc.). Read this first when working on trading features. Note `HistoryEntry` has no `marketId` — join it to a market by `label` + `strike`.

## Routes

- `src/app/(app)/` — the trading UI (wrapped by `ZoqoProvider` + `ProfileProvider` in its layout).
  - `page.tsx` — the **multi-market** view: a draggable timeline of market columns above an aligned price chart.
  - `market/[id]/page.tsx` — the single-market deep view.
- `src/app/system/page.tsx` — a live, editable, exportable **design-system explorer** (`/system`). It reads the same tokens as the product and can override CSS variables at runtime.

## The multi-market timeline (non-obvious coupling)

The market-column **header** (`MarketColumns.tsx`) and the price **chart** (`MarketChart.tsx`) are separate full-width siblings that must line up to the pixel. They share one time→x mapping via **`src/lib/chartGeo.ts`** (`timeToX`, `padLeftFor`, `PAD_RIGHT`). `page.tsx` owns the view window + pan offset and passes the same `{width, padL, padR, t0, t1}` geometry to both. If you change padding/domain on one, change it via `chartGeo` so both stay aligned. The chart clips drawing to the plot and renders a hatched "NOT YET TRADED" future zone right of "now".

## Design system & styling

- **Tailwind v4** (`@import "tailwindcss"` + `@theme` in `globals.css`). Tokens originate in **`src/lib/tokens.ts`** and are mirrored as CSS variables in `globals.css`. **Use token classes / `var(--color-*)`, never raw hex** (raw hex only inside a token definition).
- Fonts: **Inter** (UI), **Bebas Neue** + **Satoshi** (display — `font-display`). Don't add font families.
- UI primitives are a **barrel export** at `@/components/ui` (Button, SegmentedControl, Badge, etc.) — import from there, reuse before adding. Icons: **lucide-react** (no emoji, no `<img>` for icons). Class merging: `cn()` from `src/lib/cn.ts`. Motion: CSS keyframes in `globals.css` (respect `prefers-reduced-motion`).

## Responsive model

Single breakpoint divider at **`lg` (1024px)**. `≥lg`: main chart + a right rail (`RightRail` = TradeCard + order book). `<lg`: single column — the order book stacks under the chart and trading happens through `MobileTradeBar` (a sticky bottom Up/Down bar that opens a slide-up sheet hosting the shared `TradeCard`). The market-duration selector is in the nav on `lg+` and in a page-level row on mobile.
