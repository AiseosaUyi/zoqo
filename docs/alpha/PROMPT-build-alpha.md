# Master prompt: build ZOQO Alpha end to end

Paste everything below the line into Claude Code at the repo root. It assumes `docs/alpha/` exists (this folder).

---

You are building **ZOQO Alpha**, the multi-venue automated trading and betting layer for this repo. Read, in this order, and treat them as the spec: `CLAUDE.md`, `docs/alpha/00-README.md`, `docs/alpha/01-platform-digest.md`, `docs/alpha/02-market-landscape.md`, `docs/alpha/03-architecture.md`, `docs/alpha/04-schema.md`, `docs/alpha/05-mcp-spec.md`, `docs/alpha/06-football-model.md`, `docs/alpha/07-build-plan.md`. Where the docs and the code disagree, the code wins and you update the doc in the same commit.

## What you are building

One server-side engine (`src/lib/alpha/`) where a scheduler wakes a runner, the runner executes enabled strategies against venue adapters, every intent passes one risk gate, orders are placed on paper or demo venues only, outcomes are settled, strategies are scored nightly (ROI with CI, Brier/RPS, CLV, drawdown) and budget is re-allocated by a conservative sample-size-aware rule, and all of it is controllable from three doors that share one service layer: the `/alpha` page, the MCP server (new `alpha:*` scopes and the tools in `05-mcp-spec.md`), and the scheduler itself. Venues in build order: the existing ZOQO terminal (through `src/lib/server/terminalExecution.ts`, unchanged), Manifold (play money, real API), the new NGN paper sportsbook priced from real Bet9ja and SportyBet odds via odds-api.io and settled from API-Football results, then Kalshi demo, Bybit demo, Deriv virtual, and a Polymarket read-plus-simulated-fill adapter. Football gets a real feature pipeline and models (market implied with margin removal, time-decayed Dixon-Coles, ELO, a market blend, and a market-only control strategy) evaluated by RPS and CLV against the market, never by hit rate alone. `mode='live'` is forbidden at the schema level in this program; the only real-money bridge is a human-readable slip.

## How you work

Run the phases in `07-build-plan.md` in order, without stopping between phases. For each phase:

1. Write the phase plan to `docs/alpha/plans/phase-N-<name>.md` using the 7-part build prompt structure (goal, scope in/out, files touched, data changes, interfaces, verification, rollback).
2. Run `/plan-eng-review` on it. If the phase has UI, also run `/plan-design-review`. Apply the review findings to the plan before building.
3. Build it. Use `TaskCreate`/`TaskUpdate` to track the plan's steps.
4. Run `/review`, then `/qa`. Fix what they find.
5. Verify: `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npx playwright test`, `npm run build`. All must pass.
6. Commit with a message starting `alpha(phase-N):`. Do not push unless I have said to.
7. Update `docs/alpha/STATUS.md` (create it in Phase 0) with three lists: Done, Next, Needs Aise (human-only tasks with exact URLs, such as obtaining API keys or configuring Supabase SMTP and the Vercel plan). Then start the next phase immediately.

Only stop when every phase in `07-build-plan.md` through Phase 5 is committed with green checks, or when a phase cannot proceed for a reason no code can fix; in that case write the blocker to STATUS.md, skip to the next phase that does not depend on it, and keep going. Phase 6 (Python worker) is optional; scaffold `alpha-worker/` with a README and the GitHub Actions workflow but do not block on it.

## Hard rules

- Every money movement, human or agent or scheduler, goes through `src/lib/alpha/risk.ts` and then the venue adapter; terminal orders additionally keep going through `terminalExecution.ts`. No second order path anywhere.
- Every external HTTP call goes through the per-provider token bucket in `alpha_rate_budget`. Respect the documented free tiers in `02-market-landscape.md`.
- Every decision, accepted or rejected, is written to `alpha_decisions` with the features used, before the order is placed. No feature may read a result. No backfilling from hindsight.
- Secrets live in Supabase Vault (referenced from `broker_credentials.secret_ref`) or env vars. Never in a table column, never in logs, never returned by an MCP tool.
- Do not edit `src/components/terminal/TerminalShell.tsx`, `src/lib/store.tsx`, or `src/lib/engine.ts` tick logic. Extract pure math into new modules if you need it.
- Follow the repo's design system: tokens only, no raw hex, no new fonts, pill CTAs, `@/components/ui` primitives, `HeaderChrome` for page headers, single `lg` breakpoint, `prefers-reduced-motion` respected.
- Next.js 16.2.9: read `node_modules/next/dist/docs/` before writing framework code; `src/proxy.ts` is the middleware; cron config is `vercel.ts`.
- Scheduling: Supabase `pg_cron` + `pg_net` hitting the `/api/cron/*` routes with `Authorization: Bearer $CRON_SECRET`. Runner claims due strategies with `UPDATE ... WHERE next_run_at <= now() RETURNING` so overlapping invocations never double-run. Route handlers do bounded work and return; no long loops.
- Regenerate `src/lib/supabase/database.types.ts` after every migration.
- Add Vitest for pure math (Kelly, Dixon-Coles grid, margin removal, ELO, metrics, budget rule, settlement rules) and a shared adapter conformance test that every venue adapter must pass or explicitly `skip` with a reason.
- If a demo venue is unreachable from this environment, implement against its documented API, skip its conformance test with the reason, record it in STATUS.md, continue.
- Copy from open source where it is faster (see `02-market-landscape.md` §5), keep licenses, and cite the source file in a comment.
- Write docs as you go: each new module gets a header comment explaining why it exists and what it must never do, in the style already used in this repo.

## Definition of done

`/alpha` shows a strategy leaderboard across at least the terminal, Manifold, and the paper sportsbook with real n; an hourly terminal strategy has run on schedule without a human; a Manifold bet placed by the scheduler is visible on manifold.markets; a football paper bet was priced from a real Bet9ja or SportyBet line, settled from a real result, and has a CLV number; the MCP can list, create, run, pause, backtest, and kill from Claude Code with a scoped key; all checks green; STATUS.md is current.

Begin with Phase 0 now.
