# Handoff — tester report fixes (2026-09-13)

Say **"resume"** in a new session and point it at this file (or it'll find it via
`CLAUDE.md`'s pointer) to pick up exactly where this left off. Read this file, then
`TODOS.md` (backlog detail) and `PLAN-tester-report-2026-09-12.md` (the full eng-review +
design-review that produced this work) if you need more depth than what's below.

## Where this came from

A tester exercised the deployed app (`zoqo.vercel.app`) and filed a report (PDF, now
summarized into `PLAN-tester-report-2026-09-12.md`): auth was completely broken (no OTP
code ever arrived), and `/terminal`'s drawing-tool toolbar had a string of gaps. That plan
went through `/plan-eng-review` and `/plan-design-review`, which split it into a P0 auth
fix (ship immediately) and 8 P1 terminal feature items (each meant to be its own scoped
plan). The user then said **"finish all the plans from p0 to the end"** — so all 8 P1
items were implemented directly in this same session, not deferred.

## Status: everything below is implemented, verified, and UNCOMMITTED

Nothing in this session has been committed or pushed. `git status --short` at the repo
root will show every changed/new file. Commit only when the user explicitly asks.

## Done

### P0 — Auth OTP silent-failure bug (fully fixed + tested)
Root cause: `AuthModal.tsx`'s `OtpStep` never rendered `authError`, so a failed
`signInWithOtp`/`verifyOtp` (real cause: Supabase's default mailer caps at 2 emails/hour,
no custom SMTP) looked like nothing was happening.

Fixed in `src/lib/profile.tsx` and `src/components/trade/AuthModal.tsx`:
- Shared `<AuthError>` component (was duplicated in 2 places, missing in the OTP step).
- Shared `sendOtp()` helper used by both `submitEmail` and `resendOtp` (resend previously
  swallowed errors entirely via a bare `void`).
- Verify-failure recovery: reverts `verified` state, re-enables inputs, **keeps** the
  typed code, resets the `confirmingRef` guard (a real bug the outside-voice review in
  the eng-review caught — without the reset, retrying silently no-ops), adds an explicit
  "Try again" button.
- Rate-limit detection (`isRateLimitError`, status 429 / `over_email_send_rate_limit`)
  gets its own distinct log tag and user-facing message, separate from generic failures.
- `resendOtp` now also resets `confirmingRef`/`verified` state so a stale ref from an
  earlier failed attempt can't silently block a fresh code.

**Test coverage:** `e2e/auth-otp.spec.ts` (new, Playwright — the project's first
automated test) — 4 tests, all passing: failed send shows error, rate-limit shows
distinct message, failed resend surfaces error, failed verify recovers via "Try again".
`playwright.config.ts` runs against a **production build** (`next build && next start`),
not `next dev` — see the gotcha below for why.

**Infra action still needed (not code, needs Supabase dashboard access):** configure
custom SMTP in Supabase (Authentication → Emails → SMTP Settings) to actually fix the
2-emails/hour cap, and re-verify `mailer_otp_length` is still 6.

### P1 — all 8 terminal drawing-tool/chart items (implemented + browser-verified)
1. **Rectangle style/resize panel** — new `src/components/terminal/DrawingStylePanel.tsx`.
   Color swatches (7 PALETTE colors, colorblind-safe selection ring+dot, not color-only),
   stroke width (thin/medium/thick), fill opacity slider, delete/close. Floats anchored to
   the selected shape with edge-aware flip. Resize itself needed no code — the
   `lightweight-charts-drawing` library already provides drag-to-resize on selection.
2. **Long/Short position tool** — added `long-position`/`short-position` to
   `DrawingToolbar.tsx`'s `DRAWING_TOOLS` (visual annotation only, no live order — see
   "Left / deferred" below for the bigger feature the tester may have actually meant).
3. **Horizontal-ray + path tools** — added to `DRAWING_TOOLS` (both already existed in the
   underlying library, just weren't exposed in the UI).
4. **Trading session overlay** — new `src/lib/tradingSessions.ts` +
   `src/components/terminal/TradingSessionOverlay.tsx`. Sydney/Tokyo/London/NY bands,
   forex/gold only, hidden on crypto (no session concept). Renders behind the chart canvas
   (chart has `background: transparent`).
5. **Fractal indicator** — `fractal()` in `src/lib/indicators.ts`, Bill Williams 5-bar
   pattern, rendered as chart markers via `createSeriesMarkers` (arrows above/below bars).
6. **Generalized EMA periods** — `IndicatorId` now has `ema9/ema30/ema50/ema100/ema200`
   (was hardcoded `ema20/ema50`).
7. **More intraday timeframes** — `CANDLE_TIMEFRAMES` (`src/lib/candles.ts`) gained
   3m/45m/2H/4H. The timeframe `SegmentedControl` in `TerminalChart.tsx` is now wrapped in
   an `overflow-x-auto` scroll container since 9 tabs don't always fit (same fix pattern
   as a prior "terminal toolbar overflow" bug in the git history).
8. **More forex/metals pairs** — added AUD/USD, USD/CAD, USD/CHF, NZD/USD, XAG/USD
   (Silver) to `src/lib/assets.ts`, `src/lib/serverPriceFeed.ts` (Twelve Data symbols +
   mock fallback prices), `src/lib/candles.ts` (seed volatility).

All 8 were manually verified in a real browser (screenshots + DOM inspection): placed and
recolored a rectangle, confirmed persistence to `localStorage`, confirmed the session
overlay renders the correct color/position/label and is absent on BTC, confirmed the
fractal markers render on BTC/USD M1, confirmed all new timeframes and asset pairs appear
in the UI.

## Left / deferred (in `TODOS.md`, not silently dropped)

1. **[Product decision needed] Drawing-triggered live order tracking** — the tester's
   literal ask ("track when market has triggered it and its moving") implies a drawn
   Long/Short box should place a real order, not just display one. That's a new
   trust/risk-control surface (would need to route through `terminalExecution.ts`'s
   existing cap enforcement) and needs a product conversation before any code, not a
   toolbar tweak. **Ask the user before building this.**
2. **1D/1W/1M timeframes** — blocked on candle retention. `TerminalShell.tsx`'s
   `MAX_CANDLES` caps history at 24h, enough for what shipped (up to H4) but not daily+
   bars. Needs a decision on raising retention vs. backfilling from a real historical
   source.
3. **More crypto pairs beyond BTC/ETH/SOL** — each needs its own bespoke exchange
   WS/REST wiring (`useAssetPrice.ts`'s crypto branch), unlike the generalized Twelve Data
   path forex/gold pairs use. Treat as one ticket per asset.
4. **Aria-labels on the 4 new drawing-tool icons** (horizontal-ray, long-position,
   short-position, path) — flagged in the design review, small, not yet done.

## Gotchas discovered this session (read before re-testing)

- **`next dev` may not hydrate in this sandbox.** Confirmed via a minimal repro: a plain
  `useEffect` counter never advanced under `next dev` here — Turbopack's HMR websocket
  fails its handshake in this environment and appears to stall client hydration entirely.
  This is a sandbox/environment issue, not an app bug (confirmed by testing against a
  `next build && next start` production server, where everything hydrates instantly and
  correctly). **Always test/verify against a production build in this environment**, not
  `npm run dev`. `playwright.config.ts` is already set up this way.
- **`.next` cache can serve stale JS after an edit.** Twice during this session, a rebuild
  silently kept serving an old bundle (same content hash) until `rm -rf .next` before
  `npm run build`. If a browser test doesn't reflect a just-made edit, nuke `.next` first
  before concluding there's a real bug.
- **`lightweight-charts`' `timeToCoordinate()` returns `null` for times outside the
  chart's actual plotted bar range**, not just outside the visible viewport — this bit the
  session overlay (bands flickered on/off every tick before the fix). The working pattern
  (see `sessionBands` in `TerminalChart.tsx`): if `timeToCoordinate` returns null, clamp
  to the container's screen edge (0 or `containerWidth`) based on which side the target
  time falls outside the data range, rather than skipping the value.

## Verification commands (all passing as of end of session)

```bash
npx tsc --noEmit -p tsconfig.json   # clean
npx eslint . --ext .ts,.tsx         # clean (1 pre-existing unrelated warning in TerminalShell.tsx)
rm -rf .next && npm run build       # clean
npx playwright test                 # 4/4 passing
```
