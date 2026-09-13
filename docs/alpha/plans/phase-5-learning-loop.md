# Phase 5 plan: learning loop completion

## Goal
Finish what Phase 1's `evaluate.ts` stub left null: real ROI-CI/Brier/RPS/CLV/drawdown/Sharpe scoring, the conservative sample-size-aware budget reallocation rule, weekly walk-forward parameter search with human-approved proposals, and auto-pause on a confirmed loser — the actual "learning" the whole program is named for, scoped honestly per `03-architecture.md` §7's five levels.

## Scope in
- `src/lib/alpha/metrics.ts` — pure math, Vitest-first: bootstrap 95% ROI CI, hit rate, Brier, RPS, CLV (`closing_implied/taken_implied - 1`, positive = beat the closing line — see `docs/alpha/06-football-model.md` §4's correction note), max drawdown, Sharpe-like ratio on daily P&L. Every function takes plain arrays of settled-order records, no I/O — same "pure math module" discipline as `kelly.ts`/`risk.ts`. Note: `src/lib/alpha/football/metrics.ts` already implements this (built in Phase 3) — this phase's `evaluate.ts` rewrite should import from there rather than duplicating it under a new `src/lib/alpha/metrics.ts` path.
- `src/lib/alpha/budgetRule.ts` — the reallocation rule from `03-architecture.md` §7 Level 3: equal weights until `min_samples` (default 50 bets/100 trades), then proportional to `max(0, lower CI bound of ROI)` with a floor, auto-pause on negative upper CI bound. Pure function `reallocate(strategies: StrategySnapshot[]): { id: string; newBudget: number; pause?: boolean }[]`, unit tested against hand-built scenarios (a clear winner, a clear loser, an under-sampled newcomer, an already-paused strategy).
- `evaluate.ts` rewritten to call `metrics.ts` for real per-strategy numbers (replacing Phase 1's null columns) and `budgetRule.ts` nightly, writing `alpha_strategies.budget` updates and `alpha_events` kind `paused` for auto-pauses.
- `src/lib/alpha/paramSearch.ts` — Level 4: weekly walk-forward grid/random search over a strategy's declared `paramSpace` (new optional field strategies can export) against logged features+outcomes, writes an `alpha_events` row kind `proposal`. Never applies itself — `apply_proposal` (MCP tool + `/alpha` button) is the only path from proposal to live params, and it writes an `applied` event.
- `/alpha` proposals inbox: list pending `proposal` events, diff of old vs proposed params, apply/dismiss.
- MCP: `list_proposals`, `apply_proposal`, `get_strategy_stats`, `get_health` (scheduler last-tick per job, rate budgets remaining, adapter connectivity, stale-data warnings — reads `alpha_rate_budget` and each venue's last successful call time).
- Daily digest email (`src/lib/brevo.ts`, existing) gains an Alpha section: yesterday's leaderboard top 3 + any new proposals/pauses. No-ops gracefully if Brevo env vars are absent, same existing behavior.

## Scope out
The `ml` model / Python retraining (Phase 6). Any UI beyond the proposals inbox extension.

## Files touched
`src/lib/alpha/{metrics,budgetRule,paramSearch}.ts`, `src/lib/alpha/evaluate.ts` (rewrite), `src/lib/alpha/__tests__/{metrics,budgetRule}.test.ts`, `src/app/api/alpha/proposals/**`, `/alpha` proposals component, `src/lib/mcp/alphaTools.ts` (extend), `src/app/api/cron/daily-digest/route.ts` (extend), `src/lib/brevo.ts` (extend template, not rewrite).

## Data changes
None — every column this phase fills in (`roi`, `roi_ci_low/high`, `hit_rate`, `brier`, `rps`, `clv`, `max_drawdown`, `sharpe`, `budget_after`) already exists on `alpha_strategy_stats` from Phase 0, left null by Phase 1's stub on purpose for this reason.

## Interfaces
`budgetRule.ts`'s `StrategySnapshot` input and `paramSearch.ts`'s `paramSpace` declaration are new contracts strategy authors (Phase 2-4's strategies) need to satisfy retroactively if they want to participate in auto-reallocation/param search — both optional/additive, so a strategy that doesn't declare a `paramSpace` simply never gets a search proposal, which is a safe default, not a broken one.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` — this phase's acceptance criterion in `07-build-plan.md` ("after a seeded 30 days of synthetic decisions, the evaluator produces the expected allocation and pauses the losing control") is fully verifiable in this environment: it's a Vitest fixture test against synthetic data, no live credentials needed. `npm run build`.

## Rollback
`evaluate.ts`'s rewrite is the only touch to an existing Alpha file from a prior phase — keep the Phase 1 stub's git history so reverting this phase means reverting that one file plus deleting the new modules.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Cleanly separates "compute metrics" (metrics.ts) from "decide budget" (budgetRule.ts) from "propose param changes" (paramSearch.ts) — three pure-math modules a single `evaluate.ts` orchestrates, easy to test independently. |
| Code quality | Pass | No silent self-modification — `apply_proposal` requiring an explicit human/MCP call is the right conservative default per `03-architecture.md` §7's own framing ("nothing self-modifies silently"). |
| Tests | Pass | This is the one phase whose full acceptance criterion is achievable in this environment without any external credential — correctly prioritized as the real bar, with hand-built scenario coverage for the reallocation edge cases (winner/loser/under-sampled/already-paused). |
| Performance | Pass | Nightly-only cron, no hot-path concerns. |

Scope check: appropriately scoped to exactly `07-build-plan.md`'s Phase 5 — no reduction needed.

VERDICT: APPROVED — proceed to build once Phase 4 is verified green (or skipped-with-reason, per the standing rule that a blocked phase doesn't block the next one).

NO UNRESOLVED DECISIONS
