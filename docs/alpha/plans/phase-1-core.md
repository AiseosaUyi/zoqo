# Phase 1 plan: Alpha core — service, runner, risk gate, decisions, `/alpha` shell

## Goal
Stand up the whole spine the rest of the program hangs off: typed core interfaces, one service layer every door calls, a risk gate no money movement can bypass, a runner the scheduler/UI/MCP all share, and a first venue (wrapping the existing terminal, unchanged) with two strategies proving the loop end to end — including the case the user actually asked for ("trade every hour").

## Scope in
- `src/lib/alpha/core/{venue,strategy}.ts` — interfaces verbatim from `03-architecture.md` §2.
- `src/lib/alpha/risk.ts` — the 7-point gate from `03-architecture.md` §5: kill switch + per-venue enable, strategy enabled/schedule window, Kelly-fraction stake sizing capped by max_stake/daily_cap (strategy and venue), daily loss stop, exposure/cooldown caps, min-edge/max-odds filter, and unconditional logging of every rejection.
- `src/lib/alpha/kelly.ts` — pure fractional-Kelly sizing function, unit tested in isolation (used by risk.ts).
- `src/lib/alpha/service.ts` — every business function (`listVenues`, `createStrategy`, `runStrategyNow`, `listDecisions`, `getLeaderboard` stub returning empty until Phase 5's real metrics, etc.) — the single thing `/alpha`'s route handlers, the cron routes, and (from Phase 2 on) MCP tools all call. No business logic in any route handler.
- `src/lib/alpha/runner.ts` — claims due strategies with a single `UPDATE alpha_strategies SET next_run_at = <computed>, last_run_at = now() WHERE enabled AND next_run_at <= now() RETURNING *` (limited via a `LIMIT` on a matching subselect only if batch-size capping is needed — plain Postgres row locking inside one `UPDATE` already makes this race-safe across overlapping invocations without a separate `SKIP LOCKED` step, per `03-architecture.md` §6; no need for extra locking machinery here), runs each claimed row through `Strategy.evaluate` → `risk.ts` → adapter `.place()`, writes `alpha_runs`/`alpha_decisions`/`alpha_orders`.
- `src/lib/alpha/settle.ts` — for each venue, reads open `alpha_orders`, calls `adapter.settle()`, writes outcome/pnl/`closing_price_or_odds`. For `zoqo-terminal` orders specifically, also does the server-side SL/TP check the client-side tick loop does NOT do for unattended positions (per `01-platform-digest.md` §3 item 7).
- `src/lib/alpha/evaluate.ts` — Phase 1 stub: writes a same-day `alpha_strategy_stats` row with raw `n`/`pnl_today`/`pnl_total` only (roi/brier/rps/clv/sharpe columns null until Phase 5). Real metrics land in Phase 5; the table/route exist now so the UI has something to read.
- `src/lib/alpha/strategies/index.ts` (registry) + `src/lib/alpha/strategies/terminalMaCross.ts` (port of the existing `ma-cross` condition as a `Strategy`) + `src/lib/alpha/strategies/terminalHourlyMomentum.ts` (every 60 min: long/short by 4h return sign, ATR-derived stop — the user's literal example).
- `src/lib/alpha/venues/zoqoTerminal.ts` — implements `VenueAdapter` by calling `openTerminalPosition`/`closeTerminalPosition`/`getOpenOrders` from `src/lib/server/terminalExecution.ts` (imported, not reimplemented — this is the one hard rule of the whole program).
- Routes: `src/app/api/cron/alpha-run/route.ts`, `alpha-settle/route.ts`, `alpha-evaluate/route.ts` (all `CRON_SECRET`-gated, same pattern as `evaluate-triggers/route.ts`); `src/app/api/alpha/{venues,strategies,decisions,events,settings}/route.ts` (session-cookie CRUD calling `service.ts`).
- `/alpha` page (`src/app/(app)/alpha/page.tsx` + components under `src/components/alpha/`): kill switch toggle, venues list (1 row: zoqo-terminal), strategies list (enable/run-now/params/last-next run), decisions feed, events feed. Composes `HeaderChrome.tsx`. No chart yet (Phase 3 adds fixtures view).
- Automations bridge: `schedule` condition type + `run-strategy` action type added to `automationRules.ts`'s unions and to the evaluator/`CreateAutomationModal`, calling `service.runStrategyNow`.
- Vitest: `kelly.test.ts`, `risk.test.ts` (mocked venue/budget, asserts every one of the 7 gate checks independently), a fixture-based `runner` claim test if feasible without a live DB (test the SQL string / claim logic in isolation where possible — full integration needs a live Postgres, which this environment doesn't have; note that gap explicitly rather than skip silently).
- Playwright: extend `e2e/` with a smoke test for `/alpha` rendering (page loads, kill switch visible) — cannot exercise "Run now" end-to-end without a live backend, so that acceptance criterion is marked blocked-on-network in STATUS.md, not faked with a mock that doesn't prove anything real.

## Scope out
- Any venue other than `zoqo-terminal` (Phase 2+).
- Real leaderboard metrics (ROI CI, Brier, RPS, CLV) — Phase 5.
- MCP tools — Phase 2.
- Editing `TerminalShell.tsx`, `store.tsx`, or `engine.ts` tick logic — forbidden by the hard rules; `zoqoTerminal.ts` only calls the existing server-side `terminalExecution.ts` functions.

## Files touched
`src/lib/alpha/core/*.ts`, `src/lib/alpha/{risk,kelly,service,runner,settle,evaluate}.ts`, `src/lib/alpha/strategies/{index,terminalMaCross,terminalHourlyMomentum}.ts`, `src/lib/alpha/venues/zoqoTerminal.ts`, `src/app/api/cron/{alpha-run,alpha-settle,alpha-evaluate}/route.ts`, `src/app/api/alpha/**/route.ts`, `src/app/(app)/alpha/page.tsx`, `src/components/alpha/*.tsx`, `src/lib/automationRules.ts` (extend), `src/components/automations/CreateAutomationModal.tsx` (extend), `src/app/api/cron/evaluate-triggers/route.ts` (extend evaluator for the new `schedule` condition / `run-strategy` action), Vitest files above, `e2e/alpha-smoke.spec.ts`.

## Data changes
None beyond Phase 0's migration — this phase only reads/writes tables that already exist.

## Interfaces
`VenueAdapter`/`Intent`/`Strategy`/`StrategyCtx` exactly as specified in `03-architecture.md` §2 (reproduced in the plan review below for the parts worth scrutinizing). `service.ts`'s function signatures are the contract Phase 2's MCP tools and this phase's route handlers both bind to — get these right once rather than reshaping them per-door later.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run build` all green with `NEXT_PUBLIC_BACKEND_ENABLED` unset (build must succeed with Alpha routes present but backend off — same graceful-degradation bar as the rest of the app). `npx playwright test` for the new smoke spec (against the existing prod-build harness). Full live acceptance (a real Run now producing a real wallet delta) is not verifiable without a linked Supabase project — recorded as blocked-on-network in STATUS.md, not claimed.

## Rollback
Every new file is additive and under `src/lib/alpha/`, `src/app/api/alpha/`, `src/app/api/cron/alpha-*`, or `src/app/(app)/alpha/` — deleting those directories plus reverting the three touched existing files (`automationRules.ts`, `CreateAutomationModal.tsx`, `evaluate-triggers/route.ts`) is a full rollback with zero effect on `/terminal` or `/trade`.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass w/ fix applied | Finding 1: the original runner-claim design added `FOR UPDATE SKIP LOCKED` machinery the spec doesn't call for — plain Postgres row-locking inside a single `UPDATE ... WHERE ... RETURNING` is already race-safe across overlapping invocations (a second concurrent UPDATE blocks on the row, then re-evaluates WHERE against the now-future `next_run_at` and matches nothing). Simplified to match `03-architecture.md` §6 exactly — avoids unneeded complexity. |
| Code quality | Pass | Single service layer (`service.ts`) is the one call surface for UI/cron/(later)MCP — no logic duplicated in route handlers, matching the existing `terminalExecution.ts` precedent this repo already follows. |
| Tests | Pass w/ gap noted | Kelly and the 7-point risk gate are fully unit-testable in isolation (mocked venue/budget). Runner claim-race behavior genuinely requires a live Postgres to verify (row-locking semantics aren't unit-testable against nothing) — flagged as a real environment limitation in STATUS.md, not silently skipped or falsely claimed covered. |
| Performance | Pass | Runner processes claimed strategies in one bounded pass per invocation, no long-running loops in a route handler, matching the existing `evaluate-triggers` pattern and the Vercel timeout constraint noted in `01-platform-digest.md` §4. |

Scope check: ~20 files touched across a genuinely new subsystem — over the skill's usual "8 files is a smell" threshold, but this is Phase 1 of an explicitly-scoped 6-phase program building a new subsystem from zero; the alternative (further splitting Phase 1) was already decided by `07-build-plan.md`'s phase boundaries, which this plan follows rather than re-litigates.

VERDICT: APPROVED — proceed to build.

NO UNRESOLVED DECISIONS
