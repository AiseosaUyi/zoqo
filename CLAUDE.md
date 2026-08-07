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

There is **no test framework** configured. Verify changes by running the app and exercising it in the browser.

Path alias: `@/*` → `src/*`.

## What this is

ZOQO is a real-time Bitcoin **prediction market**. Users bet Up or Down on whether BTC will be higher or lower at the end of a rolling window (5 / 10 / 15 / 30 / 60 min). It is play-money (no real trading), but **all market outcomes are driven by the real BTC price** — settlement direction, strike prices, and chart data are not synthetic. The Poisson retail tape, order book, and top holders are simulated ambient noise only; they do not affect the user's P&L.

The app is designed for a **trading bot** to learn from: seeded fake trades were removed; positions, open orders, and trade history all persist to `localStorage` across sessions.

There is no real backend anywhere in the app — `/automations`, `/profile`, and `/referrals` are all client-only too (see "Local persistence & mock data" below).

## Architecture (the parts that span files)

The core trading loop is one client-side data pipeline:

```
useBtc (real BTC price)  →  ZoqoProvider (store.tsx, ticks @600ms)  →  MarketEngine (engine.ts)  →  EngineSnapshot  →  React components
```

- **`src/lib/useBtc.ts`** — live BTC price via WebSockets (Binance → Coinbase → Bitstamp fallback chain), then polls `/api/btc/price` when sockets are blocked. **In many local/sandboxed environments Binance & Coinbase are DNS-blocked**; the poll fallback (Bitstamp/CoinGecko via the API route) is the normal path locally. WS warnings in the console are expected, not bugs.

- **`src/lib/engine.ts`** (`MarketEngine`) — the simulation layer. From the real BTC price it synthesizes: rolling markets per duration (`DURATIONS_MIN = [5,10,15,30,60]`), implied YES odds (Bachelier/normal approximation anchored to real price vs. strike), a Poisson retail tape with whale spikes, volume buckets, and an order book. Markets are seeded `N_PAST`(12) back + live + `N_FUTURE`(1) ahead per duration; pruned after ~6 h. `step(now, price)` advances everything; `snapshot()` returns an immutable `EngineSnapshot`. **Settled markets freeze `lastPrice`/`changePct`/`settledUp` at close — never recompute them against the live price** (doing so is a past bug that made settled columns show the current price).

- **`src/lib/store.tsx`** (`ZoqoProvider` + `useZoqo`) — single source of trading state. Owns the engine, runs the 600 ms tick loop, manages the **wallet** (cash, positions, open orders, trade history, deposit faucet, settlement results). Persists to `localStorage` at key **`zoqo-wallet-v2`** (positions, tradeHistory up to 200 entries, userPlaced openOrders). On boot, orphaned positions/orders for markets pruned from the engine are automatically refunded. Settlement fires a `SettlementResult` into the `settlements` queue (consumed by `SettlementToast`). No fake data is seeded — history starts empty.

- **`src/lib/profile.tsx`** (`ProfileProvider` + `useProfile`) — identity/auth/gamification: handle, avatar, level/XP, streaks, daily-claim bonus, the mocked email+OTP sign-up flow (drives `AuthModal`), and the leaderboard. Persists to `localStorage` at **`zoqo-profile-v1`**. `requireAuth(onSuccess)` is the gate every trading/claim action calls through — it opens `AuthModal` if signed out and replays `onSuccess` once auth completes.

- **`src/lib/types.ts`** — domain model shared by engine, store, and UI. Read this first when working on trading features. Key notes: `HistoryEntry` has no `marketId` — join to a market by `label + strike`; it does include `closePrice` (real BTC price at settlement). `SettlementResult` (exported from `store.tsx`) carries the full settlement breakdown for the toast.

- **`src/lib/automations.ts`, `src/lib/referrals.ts`, `src/lib/profileStats.ts`** — the non-trading feature areas. `automations.ts` is real local CRUD (`useAutomations`, persisted at **`zoqo-automations-v1`**) with no execution engine behind it — creating/toggling one just writes a record. `profileStats.ts` derives calendar/day stats purely from real `tradeHistory`/`positions` — nothing fabricated. `referrals.ts` is fully mocked (no real multi-user graph) but **deterministic**: every number is a seeded function of the signed-in user's `avatarSeed` via `mulberry32` (`src/lib/math.ts`), never `Math.random()` — same seed always produces the same numbers, so the UI doesn't jitter across reloads. `profile.tsx`'s leaderboard follows the same seeded-PRNG pattern.

## Routes

```
/              →  redirects to /system  (next.config.ts, default landing)
/system        →  design-system explorer (live-editable tokens, export)
/trade         →  multi-market trading UI  ← this is the product
/market/[id]   →  single-market deep view
/automations   →  create/manage mocked trading automations
/profile       →  trader profile, portfolio stats, calendar heatmap
/referrals     →  rewards/referral program
```

`(app)/layout.tsx` wraps every route above except `/system` with `ZoqoProvider`, `ProfileProvider`, `SettlementToast`, and `AuthModal` (the app-wide auth modal, opened via `requireAuth`). The `/` → `/system` redirect in `next.config.ts` is intentional; the product lives at `/trade` so navigating to it never loops.

## The multi-market timeline (non-obvious coupling)

`MarketColumns.tsx` (column headers) and `MarketChart.tsx` (price chart) are separate full-width siblings that **must align to the pixel**. They share one time→x mapping via **`src/lib/chartGeo.ts`** (`timeToX`, `padLeftFor`, `PAD_RIGHT`). The trade page owns the view window + pan offset and passes the same `{width, padL, padR, t0, t1}` geometry to both. If you change padding or domain on one, change it through `chartGeo` so both stay aligned. The chart clips to the plot area and renders a hatched "NOT YET TRADED" zone right of "now".

## Shared header chrome (non-obvious coupling)

Four pages each need their own header (`TopNav` on `/trade` & `/market/[id]`, `AutomationsHeader`, `ProfileTopNav`, `ReferralsTopNav`) because each carries page-specific extras (TopNav's BTC/duration selector, ProfileTopNav's claim-daily gift button). The identical parts — logo, Market/Automations nav with badge, portfolio/cash stats, the cooldown-aware deposit button, the unread-settlements bell, log-in/sign-up buttons — live once in **`src/components/trade/HeaderChrome.tsx`** and the **`useDepositCooldown`** hook (`src/lib/useDepositCooldown.ts`). Extend a header by composing these pieces, not by hand-copying a fifth implementation — that's exactly how the four drifted from each other before (missing lock states, missing unread badges, inconsistent active-nav styling) in the first place.

## Design system & styling

- **Tailwind v4** (`@import "tailwindcss"` + `@theme` in `globals.css`). Tokens originate in **`src/lib/tokens.ts`** and are mirrored as CSS variables in `globals.css` — colors/surfaces are auto-mirrored via `paletteToCssVars()`, but radius/shadow/type values are **hand-mirrored** and will silently drift if you edit `tokens.ts` without also updating `globals.css`. **Use token classes / `var(--color-*)`, never raw hex** — raw hex only inside a token definition.
- **All CTAs are fully rounded** (`RADII.btn = "999px"`, enforced in `@/components/ui/Button.tsx`). Tabs, segmented controls, dropdown menu items, and quick-amount chips are intentionally *not* pill (chip radius, 8px) — they're not calls to action.
- Fonts: **Inter** (all UI text), **Bebas Neue** (numbers only — prices, balances, counts), **Satoshi** (`font-display` for wordmark). Don't add font families. Full type scale + use-case guidance: **`TYPOGRAPHY.md`**. Note the gap between docs and code: `TYPOGRAPHY.md`'s `.text-h1`/`.text-body-1`-style utility classes exist in `globals.css`, but product components don't use them — they hardcode arbitrary `text-[Npx]` values matching a scale step instead. Match a real scale step, don't invent a size.
- UI primitives barrel-exported from `@/components/ui` — import from there, reuse before adding new ones. Icons: **lucide-react** only. Class merging: `cn()` from `src/lib/cn.ts`. Motion: CSS keyframes in `globals.css` (respect `prefers-reduced-motion`).
- The `/system` page is a live explorer of these tokens and components. It can override CSS variables at runtime to preview theme changes.
- **`design.md`** is the human-readable design-system reference (colors/radii/spacing/shadows/components); use it alongside `tokens.ts` when making visual decisions. The **`/design-system`** skill (`.claude/skills/design-system/`) codifies the workflow for changing a token or adding a primitive without letting the pipeline drift.

## Responsive model

Single breakpoint at **`lg` (1024px)**. `≥lg`: full chart + right rail (`RightRail` = TradeCard + order book). `<lg`: single column — order book stacks under the chart, trading via `MobileTradeBar` (sticky bottom bar opening a slide-up sheet with the shared `TradeCard`). The market-duration selector lives in TopNav at `lg+` and in a page-level row on mobile.

## Favicon / branding

- `src/app/icon.svg` — purple `#601FFF` rounded square + white Z lettermark. Next.js serves it as `<link rel="icon" type="image/svg+xml">`.
- `src/app/favicon.ico` — generated from `icon.svg` via `sharp` (two PNG-compressed frames: 16 × 16 and 32 × 32). Regenerate with the inline Node.js script in the commit history if the SVG changes.
