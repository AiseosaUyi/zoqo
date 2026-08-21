# Prompt for Claude Code — paste this in to continue the Zoqo Terminal build

Copy everything below the line into Claude Code, run from the root of the Zoqo repo on the
`feat/trading-terminal` branch (after following the git setup steps sent alongside this file).

---

You're continuing a trading-terminal rebuild of the Zoqo app. Read `TERMINAL_SPEC.md` at the repo
root first — it's the full architecture doc (asset classes, data sources, the backend gap, the
gamification design, MCP server design, automation engine design, phased roadmap) and everything
below assumes you've read it. This prompt tells you what's already built on this branch and what
to do next, in priority order.

## What's already here (verify it, don't re-derive it)

- `src/lib/assets.ts` — the multi-asset registry (BTC/ETH/SOL crypto, XAU/USD gold, EUR/USD,
  GBP/USD, USD/JPY forex).
- `src/lib/useAssetPrice.ts` — generalized live-price hook. Crypto uses real WebSocket feeds
  (Binance → Coinbase → poll fallback), gold/forex poll `/api/quotes/[symbol]` every 30s and
  synthesize ticks between polls with a volatility-calibrated random walk.
- `src/app/api/quotes/[symbol]/route.ts` — server route backing the poll. Works today with a
  deterministic mock (no API key needed); set `TWELVE_DATA_API_KEY` in `.env.local` (free signup
  at twelvedata.com) to get real gold/forex anchors.
- `src/lib/terminalStore.tsx` — position-based paper trading (`TerminalProvider`/`useTerminal`):
  open/close positions, real-time mark-to-market P&L, shares the *same* cash balance as the
  prediction market via `useZoqo().adjustCash` (added to `src/lib/store.tsx` — one wallet, not two).
- `src/components/terminal/*` — `TerminalChart` (TradingView's `lightweight-charts`, candlesticks
  bucketed client-side from the tick stream), `Watchlist`, `OrderTicket`, `PositionsPanel`,
  `TerminalShell` (desktop 3-column MT5-style layout + a stacked mobile fallback).
- `src/lib/academy.ts` + `src/components/learn/SignalSpot.tsx` — Zoqo Academy: real hearts/XP/
  streak state, one fully working lesson type (Signal Spot — multiple choice on described chart
  setups) with 3 sample questions.
- New routes: `/terminal`, `/learn`, `/leaderboard` (P&L board reuses the existing seeded
  leaderboard from `profile.tsx`; XP board is new, currently illustrative for other users since
  there's no shared backend yet).
- `HeaderChrome.tsx` nav extended with Terminal/Learn/Leaderboard links; `/trade`'s nav label is
  now "Predict" (route itself untouched — still the BTC prediction market, unchanged).

Known state: `tsc --noEmit` is clean. `npm run build` could not be verified end-to-end in the
sandbox this was built in (Google Fonts fetch is network-blocked there — unrelated to this code);
verify it completes for you. `npm run lint`: **this repo already fails lint on `main`** — 33
pre-existing problems (`react-hooks/refs`, `react-hooks/purity`, `react-hooks/set-state-in-effect`
from the newer React Compiler ESLint rules) that predate this branch, mostly in `store.tsx`,
`useBtc.ts`, and `useDepositCooldown.ts`. This branch's new code follows the same established
patterns (e.g. the localStorage-load-in-effect shape `store.tsx` already uses) and adds 7 more
problems in the same categories, concentrated in `TerminalShell.tsx`, `terminalStore.tsx`, and
`academy.ts`. Run `npm run lint` and decide whether to do a proper pass fixing all ~40 at once
(old + new) now that you have a real dev loop — recommended before this ships, not attempted here
to avoid destabilizing the working prediction-market code blind.

## Priority order for what's next

1. **Verify the build runs and looks right.** `npm install && npm run dev`, click through
   `/terminal` (all three asset classes show live-ish prices, place a trade, watch P&L
   mark-to-market, close it), `/learn` (play the Signal Spot lesson through to completion),
   `/leaderboard`. Fix whatever's visually off — this was built without the ability to see it
   render, so treat the UI polish pass as expected work, not a sign something is broken.

2. **Full lint cleanup** (old + new, ~40 problems) — see above. Do this once, deliberately, rather
   than patching around it further.

3. **The backend** (TERMINAL_SPEC.md §2) — this is the load-bearing decision everything else
   depends on. Stand up Postgres (Supabase recommended — free tier, ships auth for free too) and
   migrate wallet/positions/trade-history/Academy streak+XP off `localStorage`. Keep
   `localStorage` as an offline cache in front of it, not the source of truth. Once this exists:
   - Real leaderboards across real users (today's is seeded/fake beyond "you").
   - Friend groups (the shareable-invite-code private leaderboard — stubbed as a disabled button
     on `/leaderboard` right now, labeled honestly).
   - The automation trigger evaluator (#5 below) and the MCP server (#6) both need it to exist.

4. **Academy content production** — the skill tree in `academy.ts`'s `SKILLS` array has 7 skills
   and ~90 total lessons scoped but only 1 built. Build out the other lesson types described in
   spec §6 (Pattern Pop — the balloon-tap mechanic, Build the Order — drag-to-set stop-loss/
   take-profit, Mock Trade — deep-links into `/terminal` for a guided live rep) and author real
   lesson content for all 7 skills. `SignalSpot.tsx` is the template for how a lesson component
   plugs into `useAcademy()`.

5. **Automation trigger engine** (spec §8) — `src/lib/automations.ts` is still CRUD-only with no
   execution behind it. Once the backend exists, add a scheduled evaluator (Vercel Cron, once a
   minute) that checks each enabled trigger's condition against the latest price and executes
   through the *same* order-placement code `terminalStore.tsx`'s `openPosition` uses — don't build
   a parallel "automation order" path. Every trigger needs `maxOrderSize`/`dailyCap` fields
   enforced at execution time (this is the "highest amount you can buy/sell from my wallet" cap
   from the original brief).

6. **MCP server** (spec §7) — a small Node server using `@modelcontextprotocol/sdk`, exposing
   `get_account_summary`, `get_quote`, `get_positions`, `place_order`, `close_position`,
   `create_automation_trigger`, etc. against the Phase-2 backend, with `read`/`trade`-scoped API
   keys per user and the same `maxSize`/`dailyCap` enforcement as #5. Don't build this against
   `localStorage` — it needs the shared backend to read/write the same state the web app shows.

7. **Drawing tools on the chart** — `TerminalChart.tsx` has a comment marking where
   `lightweight-charts-drawing` (MIT, ~68 tools: trend lines, Fibonacci, stop-loss pins, notes)
   plugs in. It's early-stage upstream (v0.1.1, no official React wrapper) — budget time to wrap
   it as a proper client component, and vendor/patch it if upstream has stalled by the time you
   pick this up.

8. **Mobile UX deep pass** — `TerminalShell.tsx` currently gets mobile "correct" (single column,
   symbol picker, ticket below the chart) but not "deep" — spec §5 calls for a five-tab bottom
   nav (Terminal/Learn/Leaderboard/Wallet/Automations, Binance-style), a swipeable symbol
   carousel instead of a `<select>`, and a slide-up order-ticket sheet in the shape
   `MobileTradeBar.tsx` already established for the prediction market. Treat this as its own
   design pass against real Binance/Robinhood/MT5-mobile screenshots, not a shrink-to-fit of the
   desktop layout.

9. **Email digests + real broker/real-money bridge** — both explicitly out of scope until later
   (spec §6 and §9 respectively). The email digest needs a transactional email provider (Resend
   is the easy pick) once the backend exists. The real-money bridge needs Aise's decision on
   which broker/exchange to integrate per asset class, plus KYC/compliance review — don't start
   building against a guessed broker API.

## Ground rules

- Don't touch `/trade`, `/market/[id]`, `/automations` (existing CRUD), `/profile`, `/referrals`
  behavior — they're the working prediction-market app and this rebuild deliberately left them
  alone. Extend, don't rewrite, unless a task above explicitly calls for a change there.
- Everything paper-traded must go through the same code path real money will later use (spec §1,
  §2) — no separate "fake" order pipeline. `terminalStore.tsx` already follows this; keep it that
  way as you build the trigger engine and MCP server on top.
- Never call `Math.random()` for anything simulated — this codebase's house rule (see `CLAUDE.md`)
  is seeded `mulberry32` everywhere, specifically so nothing jitters unexplainably across reloads
  and nothing is silently non-reproducible.
