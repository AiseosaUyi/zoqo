# Zoqo Trading Terminal — Architecture & Product Spec

Status: v1 draft, written by Claude (Cowork) on 2026-08-21 on branch `feat/trading-terminal`.
This is the master reference for the rebuild. It is the single source of truth for scope,
architecture, and phasing — read this before writing code against this branch.

## 0. What we're building, in one paragraph

Zoqo becomes a multi-asset paper-trading terminal — crypto (BTC, ETH, SOL), gold (XAU/USD),
and the top forex majors (EUR/USD, GBP/USD, USD/JPY) — with the existing BTC prediction market
kept as one product surface inside it rather than the whole app. Paper trading ("test money")
runs through the exact same order pipeline real money will later use, so nothing behaves
differently when a user graduates. Around the terminal sits "Zoqo Academy," a Duolingo-style
learning path that takes someone from knowing nothing to comfortable in ~3 months, funded by a
level-scaled hourly virtual-cash grant and a leaderboard for friend-group competition. An MCP
server exposes the whole platform (quotes, positions, orders, automation triggers) as tools so
an AI agent — including the person's own Claude session — can trade on their behalf under caps
they set. Everything ships desktop-first for the terminal (professional traders live there) and
mobile-first for Academy and quick trade management (this is where new, often broke, often
under-25 traders actually live).

## 1. What's staying from the current app vs. what's changing

**Staying (the current app already got this right):**
- The whole design system: `tokens.ts` → `globals.css` → `/system`, pill-CTA convention,
  Inter + Bebas Neue type system, the `@/components/ui` primitive barrel.
- The real-price-anchored simulation pattern in `engine.ts`/`useBtc.ts` — a real price feed
  driving synthesized intra-tick noise (order book, tape). This is exactly the right model to
  extend to gold and forex, where free real-time feeds are thin (see §3).
- `chartGeo.ts`'s shared time→x mapping discipline, `HeaderChrome.tsx`'s "one shared chrome,
  each page composes it" pattern, `useDepositCooldown`.
- The BTC prediction market itself — it becomes the `/predict` surface, unchanged in mechanics.

**Changing:**
- Single-asset (`BTC` hardcoded throughout `store.tsx`/`engine.ts`) → multi-asset, multi-asset-class.
- `MarketChart.tsx`'s hand-rolled canvas chart → TradingView's `lightweight-charts` (see §4),
  because "draw your own trend lines / Fibonacci / stop-loss pins / notes" is a hard requirement
  and reimplementing that is not a good use of build time when a mature, MIT-licensed answer exists.
- 100% client + `localStorage` → needs a real backend for anything that must survive a device,
  work while the tab is closed, or involve more than one user seeing the same data (see §2 — this
  is the single biggest structural decision in this doc, flagged up front on purpose).
- `/automations` (CRUD with no execution engine) → a real trigger engine with an evaluator that
  runs server-side, because "if the market reaches X, buy Y, cap at Z" is not safe or even
  functional as client-only code (a closed laptop lid can't place your trade).

## 2. The backend decision (read this first)

The current app has no backend by design — it was a single-player toy. Everything you've asked
for breaks that assumption:

- A **leaderboard with your brothers** needs one shared source of truth, not four separate
  `localStorage`s that never see each other.
- **Automation triggers** ("if BTC crosses $X, buy") must fire even when your laptop is closed —
  that requires a server-side evaluator polling prices on a schedule, not a `setInterval` in a
  browser tab.
- **Hourly virtual-cash grants that scale with level**, streaks, and XP need a durable ledger a
  user can't just clear by wiping browser storage.
- **Progress emails** need a server to run the digest job and a transactional email provider.
- **The MCP server** needs to read/write the same state the web app shows — it can't reach into
  someone's browser `localStorage`.
- **Eventually bridging to real money** requires custody of accounts server-side, full stop.

Recommendation: Next.js API routes (already the framework) + Postgres (Supabase or Neon — both
have a free tier, both give you auth for free too, which you also need) + a scheduled worker
(Vercel Cron hitting an API route every minute is enough at this scale) for trigger evaluation
and price-tick persistence. `localStorage` doesn't disappear — it becomes an offline cache /
optimistic-UI layer in front of the real store, the same role it plays in most trading apps.

This is the one part of the ask that is a genuine foundational decision, not just more feature
work, so it's called out instead of silently assumed. The scaffold in this branch stubs the data
layer behind an interface (`src/lib/dataStore.ts`, see §7) so swapping the `localStorage`
implementation for a Postgres-backed one later is a contained change, not a rewrite.

## 3. Market data

Researched 2026-08-21 (see chat for sources). Findings:

| Asset class | Source | Why |
|---|---|---|
| Crypto (BTC, ETH, SOL) | Binance → Coinbase → Bitstamp WS fallback chain (already built, `useBtc.ts`) | Free, real WebSocket, no key required, already proven in this codebase. Generalize `useBtc.ts` into `useAssetPrice(symbol)` covering all three pairs. |
| Gold (XAU/USD), Forex majors (EUR/USD, GBP/USD, USD/JPY) | Twelve Data REST, free tier (800 req/day, no card) | Covers forex + commodities in one API, which crypto-only providers don't. **No WebSocket on the free tier** — free-tier real-time forex/gold streaming essentially doesn't exist without a paid plan (~$79+/mo) or a broker demo account (OANDA's v20 API is free with a demo account but its terms forbid redistributing demo rates inside a product other people use — fine for your own personal bridge later, not fine as the platform's shared feed). |
| Gold/forex tick smoothing | Same synthesis approach as `engine.ts`'s Poisson tape | Poll Twelve Data every 30–60s for a real anchor price, then synthesize the ticks in between with a random walk calibrated to that pair's recent realized volatility — literally the same trick `MarketEngine` already does for BTC's order book, just applied to the price line itself for the low-frequency feeds. Label these instruments honestly in the UI (e.g. a small "sim" tick badge) so it's never presented as tick-real when the anchor is 30–60s old — same honesty the current app already has around the Poisson tape being "ambient noise only." |

Action item for later (not blocking): get a Twelve Data API key (free signup) and drop it in
`.env.local` as `TWELVE_DATA_API_KEY`. The scaffold's `/api/quotes/[symbol]` route already reads
that env var and falls back to a clearly-labeled mock series if it's absent, so the build works
today without the key.

## 4. Charting

`lightweight-charts` (TradingView's own MIT-licensed library) replaces the hand-rolled canvas
chart. On top of it, `lightweight-charts-drawing` (MIT, community plugin) adds ~68 drawing tools
— trend lines, Fibonacci retracements/extensions, Gann tools, channels, pitchforks, shapes, and
text/callout/pin annotations — which covers "put pin points, put notes, draw my own stop losses"
directly. It's an early-stage repo (v0.1.1 as of writing) with no explicit React wrapper, so it
needs to be wrapped as a `ChartCanvas` client component (scaffolded in §7) rather than dropped in
as-is; budget time to vendor/patch it if upstream stalls. Candlestick rendering, custom
indicator overlays (moving averages, RSI, etc. — computed client-side from OHLC history), and
the trade-signal markers all become `lightweight-charts` series/primitives instead of hand-drawn
canvas paths — this also finally decouples the "columns and chart must align to the pixel"
constraint that made `chartGeo.ts` necessary, since one chart object now owns both.

## 5. Terminal UX

**Desktop** (the professional surface): watchlist sidebar (symbol, class, last, %chg — crypto,
gold, forex grouped) on the left; chart + drawing toolbar centered; order ticket (market/limit/
stop, size, leverage if simulated, SL/TP) on the right; a bottom panel tabs across Positions /
Open Orders / History / Account, mirroring MT5's layout since that's the mental model
professional traders already have. Keyboard shortcuts for order entry (B/S to stage buy/sell,
Enter to confirm) — professional terminals live and die by not forcing mouse travel for every
trade.

**Mobile** (the on-ramp surface, and taken as seriously as desktop per your brief): five-tab
bottom nav — Terminal / Learn / Leaderboard / Wallet / Automations — mirroring how Binance,
not a shrunk desktop site, structures its app. Symbol switching is a swipeable horizontal
carousel, not a dropdown. The trade ticket is a slide-up sheet triggered from a sticky bottom
bar (`MobileTradeBar` already does this shape — generalize it off BTC), sized for one-thumb
operation. Chart gestures: pinch-zoom, swipe to change timeframe, long-press for crosshair +
price readout instead of a persistent crosshair eating screen space. Fills and settlements use
toast confirmations with the same micro-animation language `SettlementToast` already has —
extend, don't replace. This is genuinely worth its own design pass against Binance/Robinhood/MT5
mobile screenshots before implementation; the scaffold in §7 stands up the five-tab shell and
the slide-up ticket pattern but the full mobile interaction polish is explicitly handed off in §9.

## 6. Zoqo Academy (the learning system)

Mechanics, each mapped to a concrete Duolingo analog and a trading-specific spin:

- **Skill tree**: Foundations → Reading a Chart → Order Types → Risk Management (position
  sizing, stop-losses) → Indicators → Strategy Basics → Trading Psychology. Each skill is a unit
  of 5–8 bite-sized lessons; a skill "gilds" (levels up) on repeat correct answers, same as
  Duolingo's crown system.
- **Hearts**: 5 lives per session; a wrong answer costs one; hitting zero ends the session early
  and offers a quick review of the missed concept before hearts refill. This is what keeps
  quizzes from feeling like an exam — the cost of being wrong is small and immediate, not a grade.
- **Lesson types, gamified rather than tested**:
  - *Pattern Pop*: candlestick/chart patterns float up the screen like balloons; tap the one
    matching the prompt ("tap the head-and-shoulders") before it floats off-screen. Wrong tap or
    a miss costs a heart. This is the literal "balloon" idea from your brief, built out.
  - *Signal Spot*: a real (replayed historical) chart is shown paused at a moment in time; user
    picks what a specific indicator or price action implies next, multiple-choice, with the
    actual outcome revealed and explained afterward.
  - *Build the Order*: drag sliders/inputs to set entry, stop-loss, and take-profit on a shown
    setup; graded against a safe range (e.g. stop-loss within a sane % of entry, not "right"
    vs "wrong" only) so it teaches risk sizing, not memorization.
  - *Mock Trade*: "place this trade on the demo terminal" — deep-links straight into the real
    paper-trading terminal for a guided live rep, then reports back what happened.
- **Streaks + daily goal**: a streak counter, one streak freeze per week (Duolingo's forgiveness
  mechanic — punishing a single missed day too hard is what makes people quit for good), and a
  small daily XP goal the user sets.
- **Milestone rewards — the hourly grant**: this is where "give me free money to trade with"
  plugs in. A claimable timer (extends the existing daily-claim-bonus pattern in `profile.tsx`)
  grants virtual cash every hour actively trading or learning, base $50/hr, +$25 per Academy
  level up to a cap, so higher-level (more prepared) traders get more capital to practice with —
  incentive to actually go through the curriculum rather than skip straight to the terminal.
- **Leaderboard**: the existing seeded/deterministic leaderboard extends with two boards — P&L
  performance and Academy XP — plus **friend groups**: a shareable invite code that scopes a
  private leaderboard to just the people who joined it, which is the literal "compete with my
  brothers" use case.
- **Guidance and reminders**: a daily digest ("yesterday: 40 XP, 2 lessons, +2.1% on paper. Today's
  goal: finish Risk Management unit 3.") and a weekly "traders to follow" nudge, sent by email.
  This needs a transactional email provider (Resend or Postgres+SES both work) and is blocked on
  the backend in §2 existing — flagged, not built, in this pass.

Target: zero trading knowledge to "comfortable trading real money" in ~3 months, which at a
sustainable ~15–20 min/day pace maps to roughly 90 lessons across the seven skills above — a
concrete number to plan content production against, not just a vibe.

## 7. MCP server ("Zoqo MCP")

A small MCP server (Node, using `@modelcontextprotocol/sdk`) sitting in front of the same data
layer the web app uses (§2's Postgres, once it exists), exposing:

- `get_account_summary` — balance, equity, margin, open P&L (read-only)
- `get_quote(symbol)` — current price + recent OHLC
- `get_positions()` / `get_open_orders()` / `get_trade_history()` (read-only)
- `place_order({symbol, side, size, type, stopLoss?, takeProfit?})` — trade-enabled scope only
- `close_position(id)`, `modify_order(id, {stopLoss?, takeProfit?})`
- `create_automation_trigger({symbol, condition, action, maxSize, dailyCap})` /
  `list_automation_triggers()` / `pause_automation_trigger(id)`
- `get_academy_progress()` — so an agent coaching the user can see where they actually are

Auth: a per-user API key generated in account settings, with two scopes — `read` and `trade` —
so a user can hand a read-only key to an analysis agent and a trade-enabled key only to an agent
they actually trust to place orders, with the `maxSize`/`dailyCap` fields on every trigger and
order acting as the hard ceiling regardless of what the agent asks for (this is the "highest
amount you can buy/sell from my wallet" cap from your brief — enforced server-side, not
agent-side, since an agent's own restraint isn't a security boundary).

## 8. Automation trigger engine

Extends `automations.ts` (currently CRUD-only) with an actual evaluator: a scheduled job (Vercel
Cron, once a minute is plenty at this scale) that pulls all enabled triggers, checks each
condition against the latest price tick, and executes through the *same* order-placement code
path a human clicking "Buy" in the terminal uses — no separate "automation order" logic that
could drift from real trading behavior. Conditions to support at launch: price crosses
above/below X, % change over a rolling window, and a moving-average crossover; action is a market
order sized to a fixed amount or % of buying power, with an optional attached stop-loss/take-
profit. Every trigger carries `maxOrderSize` and `dailyCap` fields enforced at execution time,
which is also what the MCP server's `create_automation_trigger` tool writes into — one
enforcement point for both a human-built trigger and an AI-agent-built one.

## 9. Phased roadmap

**Phase 1 — this branch (in progress)**: multi-asset terminal shell, `lightweight-charts`
integration, generalized price-feed hook, paper wallet extended to multi-asset, prediction
market carved into `/predict`, Academy/leaderboard/automations UI shells with mocked data where
a backend doesn't exist yet. Goal: a coherent, navigable app that demonstrates the full IA even
before the backend lands.

**Phase 2 — backend**: stand up Postgres + auth (Supabase recommended — free tier, ships auth),
migrate wallet/positions/trade-history/streak/XP state off `localStorage`, stand up the Vercel
Cron trigger evaluator, wire real Twelve Data key, build the email digest job.

**Phase 3 — Academy content**: author the ~90 lessons across the seven skills, build out the
three mini-game lesson types fully (Pattern Pop, Signal Spot, Build the Order) with real content
banks rather than the two or three demo items the scaffold ships with.

**Phase 4 — MCP server + automation engine**: implement the MCP server against the Phase 2
backend, ship the full trigger condition builder UI, security-review the API-key scoping.

**Phase 5 — real-money bridge (explicitly not started)**: this needs Aise's decision on an
actual broker/exchange to integrate with per asset class (a regulated forex/CFD broker for pairs
and gold, a licensed exchange for crypto), KYC flow, custody model, and very likely legal/
compliance review given this becomes a money-services product at that point. Nothing in this
branch assumes a specific broker — the order pipeline is written broker-agnostic (§2's
`dataStore` interface) specifically so this slots in later without a rewrite.

## 10. What's scaffolded on this branch vs. what's still needed

See the handoff prompt (delivered alongside this doc) for the exact, actionable list. Short
version: this branch stands up the restructured IA, the multi-asset terminal shell with real
crypto data and a working `lightweight-charts` chart, the paper-trading order flow generalized
beyond BTC, and route/component shells for Academy/Leaderboard/Automations — but the backend
(§2), the full drawing-tool integration (§4), Academy content (§6), the MCP server (§7), and the
trigger evaluator (§8) are designed here and left for the next pass.
