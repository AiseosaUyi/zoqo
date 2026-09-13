# Plan: Fix tester report (Report for zoqo.pdf, 2026-09-12)

## Scope decision (D1, eng review Step 0)
This plan originally bundled a P0 auth bug with 8 separate terminal drawing-tool feature
requests across 10+ files and 2+ new components. Per eng-review Step 0 scope challenge,
**split**: this document's Eng Review below covers the **P0 auth fix only** — the part
that ships now. The P1 terminal drawing-tool items (rectangle style/resize, long/short
tool, horizontal-ray/path, trading-session indicator, fractal/EMA, timeframes, asset
pairs) are captured below for context but each becomes its **own separate scoped plan**
before implementation — they are NOT reviewed in depth in this pass.

## Source
A tester exercised the deployed app (zoqo.vercel.app) on a tablet-width mobile browser and filed two kinds of feedback:
1. Auth is completely broken (blocked all further testing).
2. `/terminal` drawing-tools/toolbar feedback — some real gaps, but the tester's blanket "no tool is properly functional" is stronger than the evidence (their own screenshot shows a rectangle they successfully drew).

Codebase investigation (this session) confirms root causes below.

---

## P0 — Auth: silent OTP failure (blocks everything else)

**Confirmed root cause**, `src/lib/profile.tsx` + `src/components/trade/AuthModal.tsx`:
- `submitEmail` (`profile.tsx:274-293`) flips `authStep` to `"otp"` *before* the async `signInWithOtp` call resolves, and only stores the error in `authError` if it fails.
- `AuthModal.tsx`'s `OtpStep` (`AuthModal.tsx:113-227`) **never renders `authError`** — only `EmailStep` and `RewardsStep` do. So a failed send is invisible: the user just watches a countdown on an empty code box forever.
- `resendOtp` (`profile.tsx:295-300`) is worse — it doesn't even capture the error (`void supabase.auth.signInWithOtp(...)`), so a failed resend is silent even in principle.
- Once a code is typed, `OtpStep`'s effect (`AuthModal.tsx:127-134`) sets `verified = true` and disables inputs (`:188`) *before* `confirmOtp`'s `verifyOtp` resolves — so a verify failure also leaves the user stuck on a "verified" UI with disabled inputs and no error shown.
- Infra-level likely cause of the actual non-delivery: `PHASE_C_HANDOFF.md:54-58` documents Supabase's default mailer is capped at **2 emails/hour, no custom SMTP configured** (`smtp_host: null`). Production (`zoqo.vercel.app`) almost certainly runs with `NEXT_PUBLIC_BACKEND_ENABLED=1` (the always-succeeds mock path can't reproduce this symptom), so testers/QA burn through the 2/hour cap immediately and every subsequent attempt just... doesn't arrive.
- Also worth re-verifying: `PHASE_C_HANDOFF.md:49-53` flags that OTP length must match Supabase project's `mailer_otp_length: 6` dashboard setting (previously drifted to 8 once already) — a silent mismatch here would independently break every code.

### Fix — as finalized through eng-review (Issues 1A/1B/2A/2B/2C/3A + outside-voice findings)

1. **Keep the optimistic transition, fix error visibility (Issue 1A).** `submitEmail` keeps flipping `authStep` to `"otp"` immediately (fast perceived UX). Extract a shared `<AuthError>` component (Issue 2A — collapses the 2x-duplicated `{authError && <p>...}` blocks in `EmailStep`/`RewardsStep` into one, used by all three steps including the previously-silent `OtpStep`).
2. **Extract a shared `sendOtp(email)` helper (Issue 2B).** Both `submitEmail` and `resendOtp` call this one helper for the `signInWithOtp` call + error capture + countdown reset, instead of `resendOtp` swallowing errors via bare `void supabase.auth.signInWithOtp(...)`.
3. **Verify-failure recovery (Issue 1B + outside-voice finding).** On `verifyOtp` failure: revert `verified` to `false`, re-enable the digit inputs, **keep** the typed code (don't clear it), show the error. Critical addition the original plan missed: `OtpStep`'s auto-verify effect is guarded by `confirmingRef` (a ref, not state, `AuthModal.tsx:113-134`) that never resets — left alone, retyping the identical code after a failure either silently no-ops (stale `confirmingRef`) or never re-fires (effect deps unchanged since `code` didn't change). Fix: reset `confirmingRef` to `false` on failure **and** add an explicit "Try again" button that calls `confirmOtp(code)` directly, rather than relying solely on the auto-fire effect.
4. **resendOtp state cleanup + race determinism (outside-voice finding, folded in).** `resendOtp` must also reset `confirmingRef`/`verified` (a stale ref from an earlier failed attempt could silently block a fresh code after resend). For the send-fails-after-user-already-typed-a-code race: `authError` is a single state field set by whichever call resolves last — no extra code needed beyond not caching stale error state; the latest error always wins naturally.
5. **Rate-limit-aware logging (Issue 2C + outside-voice refinement).** Detect Supabase's rate-limit error specifically (429 / `over_email_send_rate_limit`) and log it under its own tag (e.g. `[auth:otp-rate-limited]`) distinct from the generic `[auth:otp-send-failed]` tag for other failures, with a distinct user-facing message ("too many attempts, try again later" vs. generic "something went wrong"). A single generic tag would reproduce the exact blind spot that hid this incident.
6. **Test: Playwright E2E for the auth error paths (Issue 3A, kept over the outside-voice's unit-test suggestion — explicit user call).** This is the project's first automated test. Mock the Supabase client to force `signInWithOtp`/`verifyOtp` failures; assert the error renders on `OtpStep`, inputs re-enable with code retained, "Try again" successfully re-verifies, and the rate-limit-specific message shows for a 429.
7. **Fix the rate limit at the infra layer** (not app code): configure custom SMTP in the Supabase dashboard (Authentication → Emails → SMTP Settings) — `PHASE_C_HANDOFF.md:159-172` notes a Resend account provisioned for digest emails could double as this SMTP provider, solving both gaps with one provisioning step. This needs a human with Supabase dashboard access; flag as an infra/ops task, not a code change. Note per finding 5 above: even after this is fixed, the rate-limit-specific logging stays valuable as an early-warning signal if the new SMTP provider ever hits its own limits.
8. **Verify `mailer_otp_length` is still 6** in the Supabase project dashboard (regression risk called out in prior handoff).

**Owner split:** #1-6 are app code (this repo, single PR). #7/#8 are Supabase-dashboard/infra config — call this out explicitly since it's not a `git diff`, and should happen in parallel with #1-6, not block it (the code fix makes future failures visible; the infra fix reduces how often they happen).

---

## P1 — Terminal drawing tools: real gaps vs. perceived breakage

Confirmed NOT stubs: `TerminalChart.tsx`'s `onPlacementClick` (`:185-200`) drives real click-to-place logic against `lightweight-charts-drawing`'s `DrawingManager`, with per-asset localStorage persistence (`src/lib/drawings.ts`, key `zoqo-drawings-v1`) and reload-on-asset-switch (`TerminalChart.tsx:261-273`). This matches `PHASE_C_HANDOFF.md`'s claim that Phase D (drawing tools) shipped. The tester's own second screenshot shows a rectangle drawn on the live chart, i.e. placement works.

What's real and actionable from the report:

1. **Rectangle: no post-placement resize (4-edge handles) or color option.**
   Gap confirmed: the underlying library's `Rectangle` class supports `lineColor`/`fillColor`/`backgroundColor` (`lightweight-charts-drawing` `index.d.ts:3296-3357`), but nothing in `TerminalChart.tsx`/`DrawingToolbar.tsx` exposes a style editor, and there's no evidence of edge-drag-to-resize UI wired up. **Action:** add a selected-drawing style panel (color/fill/stroke) and confirm/wire the library's own resize-handle behavior for selected shapes (check `DrawingManager`'s selection API before building custom handles — likely exists natively and just isn't surfaced/enabled).

2. **Long/short position tool with market-trigger tracking.**
   Gap confirmed: library ships `LongPosition`/`ShortPosition` (entry/stop-loss/take-profit, 3-anchor) but `DrawingToolbar.tsx:28-40`'s `DRAWING_TOOLS` doesn't include them — not in the UI at all. **Important scope clarification:** the tester's ask ("track when market has triggered it and its moving") implies *live order-tracking*, not just a static drawn annotation — but the library's Long/Short tools are purely visual (draw a box, compute R:R text), with **no connection to `terminalStore.tsx`'s real position/order engine**. Wiring a drawing tool to actually *place or track* a live order is a materially bigger feature (drawing → order intent → `terminalExecution.ts`) than exposing an existing annotation tool. **Recommend splitting into two tickets:** (a) expose the existing visual Long/Short annotation tool (small, this sprint), (b) a separate, larger scoping conversation about whether "drawing tools trigger real orders" is even a desired product direction before building it (it's a meaningfully different feature, with all the same execution/risk-cap enforcement `terminalExecution.ts` already centralizes for the OrderTicket path).

3. **Horizontal line / half-horizontal line / trend line.**
   Trend-line and horizontal-line **already exist** in the toolbar (`DrawingToolbar.tsx:28-40`) — this is a discoverability issue, not a missing feature (icons may not read clearly, or tester didn't try them under desktop-width view). "Half horizontal line" maps to the library's distinct `horizontal-ray` tool (1-anchor ray), which is genuinely absent — only the diagonal `ray` is exposed. **Action:** add `horizontal-ray` to `DRAWING_TOOLS`; separately, do a quick pass on icon/tooltip clarity for the existing trend-line/horizontal-line tools.

4. **Freehand path — "draw as much as possible."**
   Confirmed: only `brush` (freehand) is exposed; the library's straight-segment multi-point `path` tool is not. **Action:** add `path` to `DRAWING_TOOLS`. Note current `brush` already supports unlimited freehand points by nature of the tool — if the tester meant "the multi-segment straight-line path tool," this is the `path` addition; if they meant unlimited-length freehand, verify there's no artificial point-count cap in the current brush wiring (none found in this investigation, but worth a smoke test).

5. **Trading session indicator.** Confirmed absent — no session/market-hours overlay exists anywhere in the terminal code. New feature: needs a data source for session windows (e.g. static Forex session hours: Sydney/Tokyo/London/NY, or crypto's always-on caveat) rendered as background bands on the chart, similar to the "NOT YET TRADED" hatch pattern already implemented for `/trade`'s `MarketChart.tsx` (reuse that shading approach for consistency).

6. **Fractal + MA/EMA 9/30/50/100/200 indicator.**
   Confirmed: `src/lib/indicators.ts` currently only supports `sma20/sma50/ema20/ema50/bb20/rsi14/macd` — no fractal, and EMA periods don't match the ask. **Action:** (a) generalize EMA to accept the requested period set (9/30/50/100/200) rather than hardcoded 20/50 — likely a small refactor of `IndicatorId` to a parameterized period rather than a fixed enum; (b) implement a Fractal indicator (Bill Williams' 5-bar fractal high/low) as new math in `indicators.ts` plus a chart-marker renderer in `TerminalChart.tsx`, following the existing `IndicatorMenu.tsx` pattern for toggling.

7. **More timeframes (3m, 45m, 2H, 4H, 1D, 1W, 1M).**
   Confirmed: `src/lib/candles.ts:17-23`'s `CANDLE_TIMEFRAMES` is hardcoded to `1m/5m/15m/30m/1h` only. **Action + open question:** need to confirm the underlying price-history/candle aggregation source (`price_history` table / client aggregation) can actually produce clean OHLC for 1D/1W/1M without gaps — this is a data-availability question, not just a UI dropdown change. Scope as: cheap intraday additions (3m, 45m, 2H, 4H — likely just new aggregation buckets from existing tick data) vs. longer-horizon (1D/1W/1M — may need historical backfill depending on how far back `price_history` actually retains data). Investigate `price_history` retention before committing to 1W/1M.

8. **More forex/crypto pairs.**
   Confirmed: `src/lib/assets.ts:34-98` hardcodes exactly 7 assets. Crypto price source is `useBtc.ts`'s Binance/Coinbase/Bitstamp chain (BTC-specific) plus `useAssetPrice.ts`'s generalized Twelve Data poller for gold/forex. **Action + open question:** adding pairs is mostly config (new entries in `assets.ts` + a price source), but each new crypto pair needs its own exchange WS/REST wiring (the BTC path is fairly bespoke per `useBtc.ts`), while new forex/gold pairs are cheap (just a new Twelve Data symbol) if within the existing API tier's rate limits. Recommend prioritizing forex/gold pair additions first (cheap, config-level) and treating additional crypto pairs as a separate, larger ticket per asset.

---

## Explicitly out of scope / needs a product decision before building
- Live order execution triggered from a drawn Long/Short annotation (see item 2) — this is a new trust/risk-control surface (bypasses/extends `terminalExecution.ts`'s existing cap enforcement) and deserves its own product conversation, not a bundled fix alongside a UI toolbar gap.
- 1W/1M timeframes pending confirmation of how far back `price_history` retains data.
- Additional crypto pairs beyond BTC/ETH/SOL, pending per-exchange integration cost.

## Suggested sequencing
1. Auth fix (P0, blocks all QA) — ship first, alone.
2. Drawing-tool UI gaps that are pure additions to the existing, working system: horizontal-ray, path tool, rectangle style/color panel, resize-handle enablement (items 1/3/4).
3. Indicator work: EMA period generalization + Fractal (item 6).
4. Trading session overlay (item 5).
5. Timeframes — intraday additions first, pending data-source confirmation (item 7).
6. Asset pairs — forex/gold first (item 8).
7. Separate product discussion: drawing-tool-triggered live orders (item 2b).

Full detail for all 8 P1 items now lives in `TODOS.md` (Terminal section), including effort/priority/dependencies — written 2026-09-13 per eng-review's TODOS.md step.

---

## What already exists (eng review)
- `AuthModal.tsx`'s 3-step state machine (`EmailStep` → `OtpStep` → `RewardsStep`) and its OTP countdown timer already exist and are reused as-is — the fix adds error visibility and recovery to this existing machine, it does not replace it.
- `profile.tsx`'s `submitEmail`/`resendOtp`/`confirmOtp` functions already exist; the fix refactors them (extracting `sendOtp`) rather than introducing a parallel auth path.
- The mocked (non-`BACKEND_ENABLED`) auth path is untouched by this fix — it always succeeds today and is not where the bug lives.
- Terminal drawing tools (P1 items): `lightweight-charts-drawing`'s `DrawingManager`, per-asset localStorage persistence (`src/lib/drawings.ts`), and the indicator math library (`src/lib/indicators.ts`) all already exist and are reused/extended by every P1 TODO — none of the 8 deferred items require a new drawing/persistence/indicator engine, only additive config or UI on top of what's there.

## NOT in scope (this P0 fix)
- All 8 terminal drawing-tool feature areas — deferred to `TODOS.md`, each gets its own plan (per D1 scope split).
- Introducing a broader test framework/policy for the rest of the app — Playwright is added narrowly for this one flow, not as a blanket new testing mandate (Issue 3A scope was explicitly "for the auth error paths").
- Redesigning the 3-step auth state machine itself — out of scope; the fix works within the existing `EmailStep`/`OtpStep`/`RewardsStep` structure.
- Supabase project security/rate-limit policy beyond the specific SMTP + OTP-length checks called out in #7/#8 — a full Supabase dashboard security audit is separate work.

## Failure modes (P0 fix)
| Codepath | Failure scenario | Test coverage | Error handling | User experience |
|---|---|---|---|---|
| `sendOtp` (new helper) | Supabase down / network error | Playwright E2E (mocked failure) | Yes — `authError` set, generic tag | Visible error on OtpStep |
| `sendOtp` — rate limit | 429 `over_email_send_rate_limit` | Playwright E2E (mocked 429) | Yes — distinct tag + message | Visible, distinct "try later" message |
| `resendOtp` | Same as above, plus stale `confirmingRef` from a prior failed verify | Playwright E2E | Yes, after fix | Visible error; fresh code not silently blocked |
| `confirmOtp`/`verifyOtp` failure | Wrong/expired code | Playwright E2E | Yes — revert `verified`, re-enable inputs, keep code, show error, "Try again" button | Visible error, in-place retry |
| Race: send fails after user already typed a code | Both send-error and verify-error can set `authError` | Not explicitly tested (acceptable — natural "latest wins" semantics, no dedicated test needed) | Yes, implicitly (single state field) | Whichever error resolves last displays — acceptable per eng-review Issue resolution |

No critical gaps remain unflagged: every failure mode above now has both a test and explicit error handling, and none are silent.

## Worktree parallelization strategy
Sequential implementation, no parallelization opportunity — this fix touches one tightly coupled cluster (`profile.tsx` + `AuthModal.tsx` + one new shared component + one new test file), all changes depend on the same shared `sendOtp`/`confirmingRef`/`AuthError` refactor landing together. Splitting across worktrees would create merge conflicts on the same ~2 files for no parallelism benefit.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code; checkbox as you ship.

- [ ] **T1 (P1, human: ~30min / CC: ~10min)** — auth — Extract shared `<AuthError>` component, use in EmailStep/OtpStep/RewardsStep
  - Surfaced by: Code Quality Issue 2A
  - Files: `src/components/trade/AuthModal.tsx`
  - Verify: manual — trigger an error on each of the 3 steps, confirm consistent rendering
- [ ] **T2 (P1, human: ~20min / CC: ~10min)** — auth — Extract shared `sendOtp(email)` helper used by `submitEmail` and `resendOtp`
  - Surfaced by: Code Quality Issue 2B
  - Files: `src/lib/profile.tsx`
  - Verify: manual — force a resend failure, confirm error now surfaces (previously silent)
- [ ] **T3 (P1, human: ~30min / CC: ~15min)** — auth — Fix verify-failure recovery: revert `verified`, re-enable inputs, keep code, reset `confirmingRef`, add "Try again" button
  - Surfaced by: Architecture Issue 1B + outside-voice confirmingRef finding
  - Files: `src/components/trade/AuthModal.tsx`
  - Verify: Playwright E2E (T6) covers this; manual smoke test with a forced verify failure
- [ ] **T4 (P2, human: ~15min / CC: ~10min)** — auth — Reset `confirmingRef`/`verified` in `resendOtp`
  - Surfaced by: Outside-voice resend state-cleanup finding
  - Files: `src/lib/profile.tsx`, `src/components/trade/AuthModal.tsx`
  - Verify: Playwright E2E (T6)
- [ ] **T5 (P1, human: ~20min / CC: ~10min)** — auth — Special-case Supabase rate-limit errors: distinct log tag + distinct user-facing message
  - Surfaced by: Code Quality Issue 2C + outside-voice rate-limit refinement (Cross-model tension 2)
  - Files: `src/lib/profile.tsx`
  - Verify: Playwright E2E (T6) covers the 429 case
- [ ] **T6 (P1, human: ~2-3h / CC: ~30-40min)** — auth — Add Playwright, write E2E test covering all auth error paths (send fail, rate-limit, verify fail + retry, resend)
  - Surfaced by: Test Review Issue 3A
  - Files: new `playwright.config.ts`, new `e2e/auth-otp.spec.ts`, `package.json` (add Playwright dep + script)
  - Verify: `npx playwright test` green
- [ ] **T7 (P2, human: ~30min, infra-only)** — infra — Configure custom SMTP in Supabase dashboard; verify `mailer_otp_length` is 6
  - Surfaced by: root-cause investigation (PHASE_C_HANDOFF.md)
  - Files: none (Supabase dashboard config, not a code change)
  - Verify: manually send several OTPs in a row in production without hitting the 2/hour cap

_No new tasks from Performance review (zero findings)._

---

## Design review — P1 terminal drawing-tool UI items (2026-09-13)

Design binary (`$D`) present but no OpenAI key configured — proceeded text-only per the skill's "progressive enhancement, not hard requirement" rule. Reviewed the 5 UI-bearing P1 items: rectangle style/resize panel, long/short tool icon, new line-tool icons, session overlay, indicator menu additions.

**Decisions made interactively (Passes 1-2):**
- Style panel floats anchored to the selected shape (TradingView convention), with an edge-aware flip rule so it never runs off-screen near chart edges. Resize handles are the primary visual on the shape itself; the panel is secondary.
- Panel unmounts entirely on deselect (no empty/placeholder state) — selecting a different shape swaps panel content instantly. No shape selected = no panel in the DOM.
- Session-indicator overlay is hidden entirely on crypto assets (BTC/ETH/SOL) — no session concept exists there, so no band/badge is shown rather than a misleading placeholder.

**Remaining passes, resolved directly (user requested a fast wrap-up; applying recommended defaults rather than further questions — flag any of these for revisit when each item gets its own dedicated plan):**
- **Pass 3 (User Journey):** 5/10. The tester's own frustration ("nothing works") is itself the emotional-arc signal — the fix priority in TODOS.md (rectangle style/resize first, since it's the tester's #1 complaint) already reflects this. No further storyboard needed at TODOS-stage; do a full journey pass when the style-panel item gets its own plan.
- **Pass 4 (AI Slop Risk):** 8/10 — this is an OPERATE-mode (App UI) surface, not marketing. The plan's own brief ("compact and utilitarian... must not compete visually with the chart data," "professional trading terminal, not consumer app") already avoids every App-UI anti-pattern (no dashboard-card mosaics, no decorative gradients, utility language). No hard rejections triggered.
- **Pass 5 (Design System Alignment):** 6/10 → recommend citing `DESIGN.md` tokens directly when each item's dedicated plan is written: style-panel swatches map to `PALETTE` ramp `base:"500"` steps (not raw hex), panel corners use `RADII.chip` (8px, non-CTA utility surface) not `RADII.btn`, panel/session-band colors pull from `SEMANTIC` aliases (`up`/`down`/`warning`) where applicable, all icons from lucide-react per existing convention, Inter for all panel labels.
- **Pass 6 (Responsive & Accessibility):** 4/10 — drawing tools are already desktop-only (`lg:flex`, confirmed in codebase, breaks mobile layout if shown below `lg`) per existing project convention, so no mobile layout is needed for any of these 5 items. Accessibility gap: the color-swatch picker needs a non-color-only way to distinguish selections (a checkmark/ring, not just a border color change) for colorblind users, and all icon-only buttons need `aria-label`s — flag both as requirements in each item's dedicated plan, not resolved here.
- **Pass 7 (Unresolved Decisions):** None held open — all genuine ambiguities were resolved above or explicitly deferred to each feature's own future plan (this is a TODOS-stage document, not an implementation-ready spec).

**NOT in scope (design):** Full visual mockups for all 5 items (only the style panel was scoped for future mockup generation, pending an OpenAI key for the design binary); pixel-level spacing/typography specs (deferred to each item's dedicated plan per the D1 scope split).

**What already exists (design):** `DESIGN.md`'s full token system (PALETTE/RADII/SEMANTIC), `/trade`'s `MarketChart.tsx` hatch-shading precedent for the session overlay, `@/components/ui` primitives (`Select`, `SegmentedControl`, `Tooltip`) for the style panel controls, `DrawingToolbar.tsx`'s existing icon-button styling for new tool icons — all should be reused, none require new design-system additions.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run (bug-fix scope, not a strategic product change) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | Not run at diff stage yet (pre-implementation) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 7 issues found across Architecture (2) + Code Quality (3) + Test (1) + Performance (0); all resolved via AskUserQuestion; 1 additional outside-voice finding (confirmingRef bug) + 2 cross-model tensions, all resolved. Scope: P0 auth fix only. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | Score 2/10 → 7/10 on the 2 passes taken to full interactive resolution (Info Architecture, Interaction States); Passes 3-7 resolved via recommended defaults per user's request to wrap up. Scope: 5 UI-bearing P1 terminal drawing-tool items (deferred, TODOS.md). |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run — optional, low priority for a bug fix |

**CODEX:** Not run for either review — Codex CLI installed but not authenticated (`CODEX_MODE: not_authed`); eng review fell back to a same-model-family Claude subagent for its outside voice (not a true cross-model check). Design review's outside-voices step was not invoked (user requested a fast wrap-up).

**CROSS-MODEL TENSION:** Eng review only — the outside voice was a Claude subagent (same model family), not an independent model, per the fallback rule. Its findings (confirmingRef bug, rate-limit-specific logging, resend state cleanup, E2E-vs-unit-test disagreement) were presented and resolved via AskUserQuestion as if cross-model, since the fallback path explicitly instructs treating its findings the same way — user kept Playwright (Issue 3A) over the subagent's unit-test suggestion, and accepted the other 3 findings as-is.

**VERDICT:** ENG REVIEW CLEARED (P0 auth fix, ready to implement) + DESIGN REVIEW CLEARED (P1 terminal drawing-tool items, TODOS-stage — each item still needs its own dedicated implementation plan before building, per the D1 scope split). CEO/DX reviews not run, not required for either scope.

NO UNRESOLVED DECISIONS
