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

Path alias: `@/*` → `src/*`. **No env vars are required to run `npm run dev`** — see "Backend" below; `.env.example` documents every optional key and what happens when each is absent (all of them degrade gracefully, none block local dev).

## What this is

ZOQO is a paper-trading platform with two trading surfaces sharing one wallet/engine lineage:

- **`/terminal`** — the primary landing product: a multi-asset (crypto/gold/forex) MT5-style terminal with `lightweight-charts`, drawing tools, a resizable panel system, and a real automation trigger engine.
- **`/trade`** ("Predict" in nav) — the original BTC Up/Down prediction market, still play-money but driven by the real BTC price (settlement direction, strike prices, and chart data are not synthetic). The Poisson retail tape, order book, and top holders on this surface are simulated ambient noise only — they never affect P&L.

Both surfaces also drive **Zoqo Academy** (`/learn` — a real 90-lesson curriculum across seven skills, `src/lib/lessons/*`), a real **automation trigger engine** (not a stub — see below), and an **MCP server** so an external AI agent can read the same account state and place orders under a scoped API key.

`TERMINAL_SPEC.md` (repo root) is the original architecture/product spec this was built from — read it for the "why" behind the multi-asset terminal, Academy mechanics, and MCP design. `CLAUDE_CODE_HANDOFF.md` and `PHASE_C_HANDOFF.md` are session handoff docs (their own headers date them) — **treat their "what's done" claims as a snapshot, not current truth**; the Phase C (automations + MCP) and Phase F (email digests) work they describe as "next" has since shipped (see `git log`). When in doubt, trust the code over any of these docs.

## Backend: real, but feature-flagged off by default

`NEXT_PUBLIC_BACKEND_ENABLED` (unset by default, `"1"` to enable) switches the whole data layer between two real implementations behind one interface:

- **`src/lib/dataStore.ts`** — the `DataStore` interface (`WalletRecord`, etc.) both implementations satisfy.
- **`src/lib/dataStore.localStorage.ts`** — today's localStorage behavior, Promise-wrapped. This is what runs with the flag unset — **the app you get from a plain `npm run dev` is exactly the old client-only app**: wallet, positions, trade history, profile, and automations all persist to `localStorage` (`zoqo-wallet-v2`, `zoqo-profile-v1`, `zoqo-automations-v1`) and nothing touches Supabase.
- **`src/lib/dataStore.remote.ts`** — calls the real `/api/*` routes, which are Postgres-backed via Supabase (`src/lib/supabase/{client,server,middleware}.ts`, session-cookie auth via `@supabase/ssr`). `src/lib/getDataStore.ts` picks the implementation at module scope (`BACKEND_ENABLED` export, read once — it's a build-time env var).

With the flag on, `store.tsx` and `profile.tsx` each run an **additive** effect (gated `if (!BACKEND_ENABLED) return`) that layers real Supabase Auth and a Postgres overlay on top of the same localStorage state, rather than replacing the local path outright — the localStorage read/write logic is unconditional in both files. `src/app/api/migrate/route.ts` does the one-shot local→Postgres import on first real sign-in (idempotent, keyed on the wallet row already existing).

`/referrals` is the one area with no backend path either way — it stays fully mocked (deterministic via `mulberry32`, see the Architecture section below).

The Postgres schema itself lives in **`supabase/`**: `schema.sql` is the consolidated current schema (12 tables — `profiles`, `wallets`, `positions`, `open_orders`, `trade_history`, `academy_progress`, `automations`, `automation_triggers`, `broker_credentials`, `price_history`, `api_keys`, `daily_stats_snapshot`); `migrations/*.sql` is the incremental history the Supabase CLI applies in order. Treat `schema.sql` as the source of truth for "what columns exist," not the individual migrations.

## MCP server & automation trigger engine

Both are real, not scaffolds — `/automations` has an actual evaluator behind it, not just CRUD:

- **`src/app/api/cron/evaluate-triggers/route.ts`** — a Vercel Cron job (schedule in `vercel.ts`, **not** `vercel.json` — this project's convention) that evaluates every enabled automation's condition (price-cross, % change, MA crossover) against a price series it maintains in `price_history`, and executes through the same order-placement path (`src/lib/server/terminalExecution.ts`) a human's Buy click uses — no separate "automation order" code path. `maxOrderSize`/`dailyCap` are enforced server-side at execution time, not client-side.
- **`src/app/api/mcp/route.ts`** (`mcp-handler`'s `createMcpHandler`/`withMcpAuth`) — exposes account/position/order/automation tools to an external MCP client, authenticated by a per-user API key (`zoqo_`-prefixed, SHA-256 hash persisted, raw key shown once — `src/lib/mcp/auth.ts`, issued via `/api/settings/api-keys`). Keys carry a `read` or `trade` scope; trade-scoped tools separately call `requireTrade(ctx)` per-tool (`src/app/api/mcp/route.ts`) on top of the key-validity check. Every write, human or agent-driven, funnels through `terminalExecution.ts` — same enforcement point, same caps.
- Both cron routes (`evaluate-triggers`, `daily-digest`) authenticate via `Authorization: Bearer $CRON_SECRET`, not Supabase session cookies. `daily-digest` sends through Brevo (`src/lib/brevo.ts`) and no-ops (logs, doesn't throw) if `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` are unset.
- **Vercel Hobby plan only runs cron once/day** — `vercel.ts` schedules `evaluate-triggers` at `* * * * *`, which needs at least a Pro plan to actually run at that cadence; worth checking before relying on near-real-time trigger evaluation in production.

## Architecture (the parts that span files)

The core trading loop is one client-side data pipeline (this is unchanged regardless of the backend flag — it's what both `dataStore.localStorage.ts` and the Postgres overlay sit on top of):

```
useBtc (real BTC price)  →  ZoqoProvider (store.tsx, ticks @600ms)  →  MarketEngine (engine.ts)  →  EngineSnapshot  →  React components
```

- **`src/lib/useBtc.ts`** — live BTC price via WebSockets (Binance → Coinbase → Bitstamp fallback chain), then polls `/api/btc/price` when sockets are blocked. **In many local/sandboxed environments Binance & Coinbase are DNS-blocked**; the poll fallback (Bitstamp/CoinGecko via the API route) is the normal path locally. WS warnings in the console are expected, not bugs. `/terminal`'s other assets (gold, forex) use the generalized `useAssetPrice.ts`, polling Twelve Data (`TWELVE_DATA_API_KEY`) with a labeled mock-series fallback when the key is absent.

- **`src/lib/engine.ts`** (`MarketEngine`) — the simulation layer for `/trade`. From the real BTC price it synthesizes: rolling markets per duration (`DURATIONS_MIN = [5,10,15,30,60]`), implied YES odds (Bachelier/normal approximation anchored to real price vs. strike), a Poisson retail tape with whale spikes, volume buckets, and an order book. Markets are seeded `N_PAST`(12) back + live + `N_FUTURE`(1) ahead per duration; pruned after ~6 h. `step(now, price)` advances everything; `snapshot()` returns an immutable `EngineSnapshot`. **Settled markets freeze `lastPrice`/`changePct`/`settledUp` at close — never recompute them against the live price** (doing so is a past bug that made settled columns show the current price).

- **`src/lib/store.tsx`** (`ZoqoProvider` + `useZoqo`) — single source of `/trade` state. Owns the engine, runs the 600 ms tick loop, manages the **wallet** (cash, positions, open orders, trade history, deposit faucet, settlement results). Persists to `localStorage` at key **`zoqo-wallet-v2`** unconditionally; layers a Supabase overlay on top when `BACKEND_ENABLED` (see "Backend" above). On boot, orphaned positions/orders for markets pruned from the engine are automatically refunded. Settlement fires a `SettlementResult` into the `settlements` queue (consumed by `SettlementToast`). No fake data is seeded — history starts empty. `src/lib/terminalStore.tsx` is the equivalent store for `/terminal`'s positions (separate `kind='terminal'` records from `/trade`'s `kind='prediction'` ones server-side); it also enforces a real position-size cap (`MAX_POSITION_PCT`/`MAX_RISK_PCT`).

- **`src/lib/profile.tsx`** (`ProfileProvider` + `useProfile`) — identity/auth/gamification: handle, avatar, level/XP, streaks, daily-claim bonus, the leaderboard. Persists to `localStorage` at **`zoqo-profile-v1`**; with `BACKEND_ENABLED`, the email+OTP sign-up flow (`AuthModal`) becomes real Supabase Auth (`signInWithOtp`/`verifyOtp`) instead of mocked. `requireAuth(onSuccess)` is the gate every trading/claim action calls through — it opens `AuthModal` if signed out and replays `onSuccess` once auth completes.

- **`src/lib/types.ts`** — domain model shared by engine, store, and UI. Read this first when working on `/trade` features. Key notes: `HistoryEntry` has no `marketId` — join to a market by `label + strike`; it does include `closePrice` (real BTC price at settlement). `SettlementResult` (exported from `store.tsx`) carries the full settlement breakdown for the toast.

- **`src/lib/automations.ts`, `src/lib/automationRules.ts`, `src/lib/orderExecution.ts`** — `/automations`' real trigger engine (see "MCP server & automation trigger engine" above for the evaluator/execution path). **`src/lib/referrals.ts`, `src/lib/profileStats.ts`** — `profileStats.ts` derives calendar/day stats purely from real `tradeHistory`/`positions` — nothing fabricated. `referrals.ts` is fully mocked (no real multi-user graph) but **deterministic**: every number is a seeded function of the signed-in user's `avatarSeed` via `mulberry32` (`src/lib/math.ts`), never `Math.random()` — same seed always produces the same numbers, so the UI doesn't jitter across reloads. `profile.tsx`'s leaderboard follows the same seeded-PRNG pattern.

## Routes

```
/              →  redirects to /terminal  (next.config.ts, default landing)
/system        →  design-system explorer (live-editable tokens, export) — not linked from nav, direct URL only
/terminal      →  multi-asset MT5-style trading terminal (crypto/gold/forex)  ← the landing product
/trade         →  BTC Up/Down prediction market UI ("Predict" in nav)
/market/[id]   →  single-market deep view (prediction market)
/learn         →  Zoqo Academy — real 90-lesson skill tree (src/lib/lessons/*), Mock Trade deep-links into /terminal
/leaderboard   →  P&L + Academy XP boards
/automations   →  create/manage trading automations — real trigger engine, evaluated once/minute (see above)
/profile       →  trader profile, portfolio stats, calendar heatmap
/referrals     →  rewards/referral program (fully mocked, deterministic — see Architecture)
/settings      →  MCP API key management (issue/revoke), email digest opt-in
```

`(app)/layout.tsx` wraps every route above except `/system` with `ZoqoProvider`, `ProfileProvider`, `AcademyProvider`, `SettlementToast`, and `AuthModal` (the app-wide auth modal, opened via `requireAuth`). The `/` → `/terminal` redirect in `next.config.ts` is intentional — `/terminal` is the professional-trader-facing front door; `/system` stays reachable by direct URL for internal design-system work but is deliberately not the landing page or in nav. `src/proxy.ts` is this project's Next.js 16 `middleware.ts` replacement — it refreshes the Supabase session cookie on every navigation except `_next`/`api`/static.

## Terminal panel system (non-obvious coupling)

`/terminal`'s desktop layout is a real resizable/collapsible/drag-reorderable panel grid via **`react-resizable-panels` v4** (not v2/v3 — training data on this library is very likely stale; verify against `node_modules/react-resizable-panels/dist/react-resizable-panels.d.ts` before writing against it). `TerminalPanel.tsx` combines the library's `Panel` (resize/collapse mechanics) with **`PanelFrame`** (`@/components/ui/PanelFrame.tsx` — a shared primitive, also used by `/trade`'s panel chrome) for the visible header/toolbar (drag handle, refresh/screenshot/collapse/close icons — only wired per-panel when the action does something real, never faked). Layout state persists via `useDefaultLayout`'s `storage` param — **always pass an explicit SSR-safe shim** (`src/lib/terminalLayout.ts`'s `ssrSafeLayoutStorage`); the default eagerly evaluates the bare `localStorage` global and throws during SSR. The chart itself (`TerminalChart.tsx`, `lightweight-charts`) manages its own sizing via an explicit `ResizeObserver` + `chart.resize()` rather than the library's `autoSize: true`, which misses some of this panel system's flex-basis-driven resizes.

## The multi-market timeline (non-obvious coupling, /trade)

`MarketColumns.tsx` (column headers) and `MarketChart.tsx` (price chart) are separate full-width siblings that **must align to the pixel**. They share one time→x mapping via **`src/lib/chartGeo.ts`** (`timeToX`, `padLeftFor`, `PAD_RIGHT`). The trade page owns the view window + pan offset and passes the same `{width, padL, padR, t0, t1}` geometry to both. If you change padding or domain on one, change it through `chartGeo` so both stay aligned. The chart clips to the plot area and renders a hatched "NOT YET TRADED" zone right of "now".

## Shared header chrome (non-obvious coupling)

Four pages each need their own header (`TopNav` on `/trade` & `/market/[id]`, `AutomationsHeader`, `ProfileTopNav`, `ReferralsTopNav`) because each carries page-specific extras (TopNav's optional `showBack` link on `/market/[id]`, ProfileTopNav's claim-daily gift button). TopNav intentionally dropped its old BTC-asset badge and duration-tab selector — `/trade` is single-asset, so a picker for one asset was never real UI; the duration control now lives page-level, next to the chart, not in the header. The identical parts — logo, Market/Automations nav with badge, portfolio/cash stats, the cooldown-aware deposit button, the unread-settlements bell, log-in/sign-up buttons — live once in **`src/components/trade/HeaderChrome.tsx`** and the **`useDepositCooldown`** hook (`src/lib/useDepositCooldown.ts`). Extend a header by composing these pieces, not by hand-copying a fifth implementation — that's exactly how the four drifted from each other before (missing lock states, missing unread badges, inconsistent active-nav styling) in the first place.

## Design system & styling

- **Tailwind v4** (`@import "tailwindcss"` + `@theme` in `globals.css`). Tokens originate in **`src/lib/tokens.ts`** and are mirrored as CSS variables in `globals.css` — colors/surfaces are auto-mirrored via `paletteToCssVars()`, but radius/shadow/type values are **hand-mirrored** and will silently drift if you edit `tokens.ts` without also updating `globals.css`. **Use token classes / `var(--color-*)`, never raw hex** — raw hex only inside a token definition.
- **All CTAs are fully rounded** (`RADII.btn = "999px"`, enforced in `@/components/ui/Button.tsx`). Tabs, segmented controls, dropdown menu items, and quick-amount chips are intentionally *not* pill (chip radius, 8px) — they're not calls to action.
- Fonts: **Inter** (all UI text), **Bebas Neue** (numbers only — prices, balances, counts), **Satoshi** (`font-display` for wordmark). Don't add font families. Full type scale + use-case guidance: **`TYPOGRAPHY.md`**. Note the gap between docs and code: `TYPOGRAPHY.md`'s `.text-h1`/`.text-body-1`-style utility classes exist in `globals.css`, but product components don't use them — they hardcode arbitrary `text-[Npx]` values matching a scale step instead. Match a real scale step, don't invent a size.
- UI primitives barrel-exported from `@/components/ui` — import from there, reuse before adding new ones. Icons: **lucide-react** only. Class merging: `cn()` from `src/lib/cn.ts`. Motion: CSS keyframes in `globals.css` (respect `prefers-reduced-motion`).
- The `/system` page is a live explorer of these tokens and components. It can override CSS variables at runtime to preview theme changes.
- **`design.md`** is the human-readable design-system reference (colors/radii/spacing/shadows/components); use it alongside `tokens.ts` when making visual decisions. The **`/design-system`** skill (`.claude/skills/design-system/`) codifies the workflow for changing a token or adding a primitive without letting the pipeline drift.

## Responsive model

Single breakpoint at **`lg` (1024px)**, used consistently across both trading surfaces. On `/trade`: `≥lg` is full chart + right rail (`RightRail` = TradeCard + order book); `<lg` is single column — order book stacks under the chart, trading via `MobileTradeBar` (sticky bottom bar opening a slide-up sheet with the shared `TradeCard`). The market-duration selector lives in TopNav at `lg+` and in a page-level row on mobile. On `/terminal`: `≥lg` is the full resizable panel grid (see "Terminal panel system" above); `<lg` is a fixed chart-over-data-tables stack with a swipeable symbol carousel and its own slide-up order ticket (`MobileTerminalBar.tsx`, generalized from `MobileTradeBar.tsx`'s pattern). Drawing tools are desktop-only (`lg:flex`) — confirmed to break mobile layout if made visible below that breakpoint.

## Favicon / branding

- `src/app/icon.svg` — purple `#601FFF` rounded square + white Z lettermark. Next.js serves it as `<link rel="icon" type="image/svg+xml">`.
- `src/app/favicon.ico` — generated from `icon.svg` via `sharp` (two PNG-compressed frames: 16 × 16 and 32 × 32). Regenerate with the inline Node.js script in the commit history if the SVG changes.
