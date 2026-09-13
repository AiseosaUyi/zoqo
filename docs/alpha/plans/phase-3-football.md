# Phase 3 plan: football data layer + NGN paper sportsbook

## Goal
The largest and most infra-heavy phase: a real ingest pipeline (fixtures, odds, results, lineups, injuries), team ratings (ELO + Dixon-Coles fit in TypeScript), the NGN paper sportsbook venue, football strategies, and the backtest that proves (or disproves) the model against the market — honestly, per `06-football-model.md` §6's expectation that this usually breaks about even after margin.

## Scope in
- `src/app/api/cron/alpha-ingest/route.ts` — bounded-batch ingest per `06-football-model.md` §1: fixtures (API-Football), odds snapshots (odds-api.io, Bet9ja + SportyBet), results, lineups/injuries. Every external call goes through `alpha_rate_budget` token buckets (new: `src/lib/alpha/rateBudget.ts` — `checkAndConsume(provider, cost)` reading/writing the Phase 0 table, atomic via a single `UPDATE ... WHERE used + cost <= limit_per_window RETURNING`).
- `src/lib/alpha/providers/{oddsApiIo,apiFootball}.ts` — thin typed HTTP clients, each behind the rate budget. Both require API keys this environment doesn't have (`ODDS_API_IO_KEY`, `API_FOOTBALL_KEY`) — implemented against their documented schemas (linked in `02-market-landscape.md`), with the ingest route's own tests using recorded fixture JSON rather than live calls (see Tests below), and the live-network path marked blocked-on-credentials in STATUS.md.
- `src/lib/alpha/features/fixtureFeatures.ts` — the full vector from `06-football-model.md` §2.
- `src/lib/alpha/ratings.ts` — ELO (K=20, home adv 60 pts) updated after every FT result; Dixon-Coles fit (attack/defence strengths, time decay ξ=0.001/day) refit from `alpha_team_ratings`/`alpha_fixtures` history. Ported math, not a full library dependency, per `02-market-landscape.md` §5's note on `martineastwood/penaltyblog` (MIT) — cite it in a comment where the formula is lifted.
- `src/lib/alpha/__fixtures__/` — Football-Data.co.uk CSVs for the top-5 leagues (free, includes closing odds) checked in for backfill and the frozen 300-fixture Vitest sample per `06-football-model.md` §4.
- `src/lib/alpha/venues/zoqoSportsbook.ts` — NGN ledger (`alpha_ledger`), markets = fixture × {1X2, DC, O/U 2.5, BTTS}, settlement from `alpha_fixtures.status`/goals, slip builder.
- `src/lib/alpha/models/{market,dixonColes,elo,blend}.ts` — the four Phase-1-scope models from `06-football-model.md` §3 (the `ml` CatBoost model is Phase 6, Python-only).
- Strategies: `football-value-1x2`, `football-value-ou25`, `football-line-move`, `football-market-only-control`.
- MCP: `list_fixtures`, `get_fixture`, `get_fixture_features`, `predict_fixture`, `get_odds_history`, `build_slip`, `backtest_strategy`.
- `/alpha` fixtures tab: model vs market probabilities, edge highlighting, slip builder, CLV column post-kickoff.
- Backtest: walk-forward over the checked-in seasons, RPS vs market, CLV, ROI CI — `src/lib/alpha/backtest.ts`, exercised by the frozen-300-fixture Vitest suite (this is the one piece of this phase fully verifiable in this environment, since it runs on checked-in historical data, not a live API).

## Scope out
Kalshi/Bybit/Deriv/Polymarket (Phase 4). The `ml` model and Python worker (Phase 6). Accumulators/parlays (explicitly Phase 2 in `03-architecture.md` §8's own numbering, i.e. later than this phase's core bet types).

## Files touched
Listed above; also `supabase/migrations/<ts>_alpha_phase3.sql` only if the backfill CSVs need a staging table beyond Phase 0's `alpha_fixtures`/`alpha_odds_snapshots`/`alpha_team_ratings` (expected: none, Phase 0 already covers them).

## Data changes
Backfill of `alpha_team_ratings` and historical fixtures from the checked-in CSVs — a one-time seed script (`src/lib/alpha/scripts/backfillRatings.ts`, run manually, not by cron) rather than a migration, since it's data population, not schema.

## Interfaces
`predict_fixture`'s model union (`"market" | "dixon-coles" | "elo" | "blend"`) is the contract the MCP tool, the `/alpha` fixtures tab, and the backtest all share — define it once in `src/lib/alpha/models/index.ts`.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (frozen-300-fixture backtest suite is the real, live-network-independent proof point for this phase — it must show blend RPS within ~0.005 of market RPS per `06-football-model.md`'s "it will not beat the market; that is expected"), `npm run build`. Live ingest (real odds-api.io/API-Football calls, a real paper bet settled from a real result) needs credentials this environment doesn't have — blocked-on-credentials in STATUS.md, adapters built against documented schemas only.

## Rollback
Additive — new tables were already scoped in Phase 0's migration (no new DDL expected), everything else is new files under `src/lib/alpha/`. Deleting them is a full rollback.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Ingest/features/ratings/venue/models/strategies separation matches `03-architecture.md`'s own module boundaries — no new pattern invented. |
| Code quality | Pass w/ note | Ported math (ELO/Dixon-Coles) must cite its source per the hard rule in `PROMPT-build-alpha.md` ("copy from open source where faster, keep licenses, cite the source file") — flagged so the build step doesn't skip the citation comment. |
| Tests | Pass | The frozen-300-fixture backtest is the one part of this phase fully testable without live credentials — correctly identified as the real verification bar, not a placeholder. |
| Performance | Pass | Ingest is bounded-batch through a token bucket by design, matching the Vercel-timeout constraint noted in `01-platform-digest.md` §4. |

Scope check: this is the single largest phase in the program (07-build-plan.md budgets 3 days) — appropriately large given it's building an entire data pipeline + model stack + new venue; further splitting was already considered and rejected by the build plan's own phase boundaries.

VERDICT: APPROVED — proceed to build once Phase 2 is verified green.

NO UNRESOLVED DECISIONS
