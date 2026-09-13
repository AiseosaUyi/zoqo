# 01. Platform digest: what ZOQO actually is today (2026-09-13)

Read this before anything else in `docs/alpha/`. It is a scrutiny of the repo as it sits on disk, not a restatement of the handoff docs. Where the docs and the code disagree, this file follows the code.

## 1. One-paragraph truth

ZOQO is a paper-trading web app (Next.js 16.2.9, React 19, Tailwind v4, Supabase, Vercel) with two trading surfaces sharing one wallet: a multi-asset MT5-style terminal (`/terminal`, crypto + gold + silver + forex majors, market orders plus resting limit orders on the client, SL/TP) and a synthetic BTC Up/Down binary prediction market (`/trade`, real BTC price anchors, everything else simulated). Around those sit a 90-lesson Academy, a real trigger-based automation engine evaluated by cron, a real MCP server keyed by per-user API keys, email digests, a deterministic mocked referral page, and a design-system explorer. The backend is real Postgres behind a feature flag (`NEXT_PUBLIC_BACKEND_ENABLED=1`) and is set in `.env.local`. There is no strategy layer, no model, no backtester, no external venue, no betting, and no "learning" beyond human lessons. Everything the user described wanting (hourly automated trading across venues, self-improving strategies, a control-everything MCP, football betting) is net-new.

## 2. What is real and load-bearing (keep, extend, do not fork)

| Piece | File(s) | Status | Notes for the Alpha build |
|---|---|---|---|
| Single execution path | `src/lib/server/terminalExecution.ts` + `src/lib/orderExecution.ts` | Real. Optimistic-concurrency on `wallets.updated_at`, bounded retries, best-effort rollback | This is the enforcement point. Every new venue adapter must write through an equivalent, and terminal orders must keep using this exact function. |
| Trigger evaluator | `src/app/api/cron/evaluate-triggers/route.ts` | Real. 3 condition types (`price-cross`, `pct-change`, `ma-cross`), fires on crossing not on state, enforces `max_order_size` and `daily_cap` server-side | Model for the strategy runner: same auth (`CRON_SECRET`), same "compute then execute through the shared path" shape. Extend the condition union rather than adding a second evaluator. |
| MCP server | `src/app/api/mcp/route.ts`, `src/lib/mcp/tools.ts`, `src/lib/mcp/auth.ts` | Real. `mcp-handler` v2, 12 tools, `read`/`trade` scopes, SHA-256 hashed `zoqo_` keys, `last_used_at` awaited | Terminal-only surface. Add tools in `tools.ts` and register in `route.ts`. Keep `requireTrade` per tool. |
| Schema | `supabase/schema.sql` (source of truth), `supabase/migrations/*` | Real, 12 tables, RLS on all user tables, `price_history` 24 h retention, `broker_credentials` shape exists but is unwired | New tables go in a new migration and get appended to `schema.sql`. |
| Data layer | `src/lib/dataStore.ts` + localStorage and remote impls, `src/lib/getDataStore.ts` | Real, additive overlay | New Alpha state should be server-first (service role from cron, session from UI). Do not add Alpha state to localStorage. |
| Price feeds | `src/lib/serverPriceFeed.ts`, `src/lib/useAssetPrice.ts`, `src/lib/useBtc.ts`, `src/app/api/btc/history/route.ts` | Real with fallback chains (Binance, Coinbase, Bitstamp, CoinGecko, Twelve Data with labeled mock) | `getCryptoPrice`/`getQuotePrice` are the server-side quote functions to reuse. Real daily OHLC exists only for BTC today (see TODOS). |
| Auth | Supabase OTP via `profile.tsx` + `AuthModal.tsx`, `src/proxy.ts` refreshes cookies | Real, but Supabase default mailer is capped at 2 emails/hour until custom SMTP is configured | Infra task, not code. Blocks new sign-ups in prod. |
| Asset registry | `src/lib/assets.ts` | Real. BTC, ETH, SOL, XRP, DOGE, XAU, XAG, EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF, NZD/USD | Adding a pair is config only (see TODOS). |
| Cron config | `vercel.ts` (not `vercel.json`) | `evaluate-triggers` at `* * * * *`, `daily-digest` at `0 8 * * *` | Vercel Hobby runs cron once per day. See section 4. |
| Tests | `e2e/auth-otp.spec.ts` (Playwright, prod build) | 4 passing tests. No unit framework | Add Vitest for the pure Alpha math (Kelly, Dixon-Coles, settlement). |

## 3. What is thinner than the docs imply

1. **`/trade` is not a prediction market venue.** It is a BTC-only binary Up/Down game with an internal engine (`engine.ts`) that synthesizes odds via a Bachelier approximation. No external markets, no other assets, no order book that affects P&L. The MCP has no prediction-market tools at all (`get_open_orders` always returns `[]` and is documented as such).
2. **The automation engine has no notion of time-based triggers, strategies, or venue.** Conditions are price patterns on one terminal symbol. "Trade every hour" cannot be expressed. Actions are a single market order.
3. **`price_history` is pruned at 24 h.** Any MA or window longer than a day is silently impossible for the evaluator. Also, `readSeries` caps at 1000 rows and inserts one row per minute per symbol, so anything past ~16 h is already truncated.
4. **Cron cadence in production is unverified.** `vercel.ts` asks for once a minute; Hobby plan delivers once a day. Nobody has confirmed which plan `zoqo.vercel.app` is on. Until confirmed, assume the trigger engine effectively does not run in prod.
5. **`api_keys` scopes are `read` and `trade` only.** There is no venue scope, no per-key cap, no kill switch. For an agent that will run unattended across venues that is not enough.
6. **`broker_credentials` is a placeholder.** Nothing reads it. Secrets are env vars only.
7. **Client-side terminal features (limit orders, SL/TP checks) live in `TerminalShell.tsx`'s tick loop, not on the server.** Server-side `getOpenOrders` is honest about this. Anything automated cannot rely on client-side limit tracking.
8. **Academy "learning" is human learning.** There is no ML, no backtest, no strategy evaluation anywhere in the repo. The five `polymarket-*` skills under `.agents/skills/` are Python scripts vendored for their paper-to-live gating pattern (env flag, per-trade cap, daily loss limit, confirm gate). They are reference material, not wired into the app.
9. **Handoff docs are stale on commit state.** `HANDOFF-2026-09-13-tester-report.md` says everything is uncommitted; `git log` shows it committed (`a80b7c0` and earlier). Trust git.
10. **Open regression.** TODOS records a "chart renders ~1 candle instead of 480" repro on a clean `next start`. Unresolved, P1 if it reproduces manually. Not in Alpha scope but do not build chart-dependent Alpha UI until it is closed.

## 4. Infra facts that gate the Alpha build

| Fact | Impact | Decision recorded in `03-architecture.md` |
|---|---|---|
| Vercel Hobby cron = once per day | Hourly/minute strategies do not run | Move scheduling to Supabase `pg_cron` + `pg_net` calling the existing `/api/cron/*` routes with `CRON_SECRET`. Keep `vercel.ts` entries as a no-op fallback. GitHub Actions `schedule` (5 min floor) is the second fallback. |
| Vercel serverless function timeout (10 s Hobby, 60 s Pro default) | Strategy runs that fetch odds for many fixtures will time out | Runner processes in bounded batches, persists a cursor in `alpha_runs`, and returns; the scheduler calls again. No long-running loops in a route handler. |
| Twelve Data free = 800 req/day | Forex/gold quote budget is already partly spent by the evaluator | Alpha quotes for forex reuse the same 10 min cache. Add Deriv or Bybit demo feeds for anything faster. |
| Supabase free tier | Fine for volume here. pg_cron and pg_net are available on free. | Enable both extensions in a migration. |
| Nigeria network | Binance blocked at ISP level; Betfair, OANDA, Alpaca do not onboard Nigerians | Venue choices in `02-market-landscape.md` respect this. All chosen venues confirmed reachable. |

## 5. Health of the codebase for a large build

Good: typed end to end (`database.types.ts` generated), one shared math module for order execution, RLS everywhere, environment degrades gracefully, docs are unusually thorough. The `CLAUDE.md` is a real operating manual.

Risky: no unit tests for money math; `TerminalShell.tsx` is a large stateful component that owns candle seeding, limit checking and SL/TP; `store.tsx` has documented scar tissue around hydration races. The Alpha build must not route through either of those files. It lives server-side and gets its own page.

## 6. What "ready" means for the user's goal

Ready today: a wallet, an auth system, a server execution path with caps, a cron entry point, an MCP with key scoping, a UI shell and design system.

Not ready (all net-new, in dependency order): venue abstraction, strategy registry and runner, time-based scheduling that actually fires, decision and outcome logging, evaluation and capital allocation (the "learning"), an odds and fixture data layer, a football model, a paper sportsbook, the expanded MCP, and the `/alpha` control page.

That ordering is the phase order in `07-build-plan.md`.
