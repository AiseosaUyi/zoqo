# Phase 0 plan: Ground truth and infra

## Goal
Lay the infra Alpha depends on without touching any Alpha business logic yet: the schema migration (written, reviewed, ready to apply), a raised `price_history` retention window so features longer than a day are possible, a unit-test framework with the first real test, and `STATUS.md` as the single running record of what's done/next/blocked — including the fact that this environment has no live Supabase/venue credentials to apply or verify against.

## Scope in
- `supabase/migrations/<ts>_alpha_phase0.sql` implementing `04-schema.md`'s tables/extensions/constraint changes verbatim (14 new tables, `pg_cron`/`pg_net` extensions, `api_keys`/`automations` constraint changes), appended to `supabase/schema.sql`. **The 5 `cron.schedule()` calls are NOT in this file** — see finding 1 below — they live in `supabase/alpha-cron-apply.sql.example` (gitignored-pattern template, not applied), reading the secret from an env var at apply time, so a real `CRON_SECRET` is never committed.
- `evaluate-triggers/route.ts`: raise `PRICE_HISTORY_RETENTION_MS` to 30 days; add a downsample step for rows older than 48h — per asset, keep only the row nearest each 5-minute boundary, delete the rest.
- `vitest` + `@vitest/coverage-v8` devDependencies, `vitest.config.ts`, `"test:unit": "vitest run"` script.
- First unit test: `src/lib/__tests__/orderExecution.test.ts` covering `computeOpenPosition`/`computeClosePosition` (cap rejections at and just under the boundary, P&L sign for long/short, partial close, closing more than held qty clamps to full position).
- `docs/alpha/STATUS.md` created with Done / Next / Needs Aise.

## Scope out
- Actually applying the migration to the live Supabase project, or running `cron.schedule` against a real production URL — this environment has no Supabase access token and pulling production secrets was denied by the permission classifier. Recorded under Needs Aise instead.
- Confirming the Vercel plan tier (not exposed by the CLI's project-level commands available here) — Needs Aise.
- Configuring Supabase custom SMTP — Needs Aise, unchanged from existing TODOS.
- Any `src/lib/alpha/*` code — starts Phase 1.

## Files touched
- `supabase/migrations/<ts>_alpha_phase0.sql` (new)
- `supabase/alpha-cron-apply.sql.example` (new — templated cron.schedule calls, not committed as a real secret; see finding 1)
- `supabase/schema.sql` (append)
- `src/app/api/cron/evaluate-triggers/route.ts` (retention + downsample)
- `package.json` (`test:unit` script, vitest deps)
- `vitest.config.ts` (new)
- `src/lib/__tests__/orderExecution.test.ts` (new)
- `docs/alpha/STATUS.md` (new)

## Data changes
14 new tables per `04-schema.md`, all additive; two existing-table constraint swaps (`api_keys.scope` check widened, `automations.condition_type` check widened) plus one additive column (`api_keys.scopes text[]`). No drops, no data migration needed (both tables are currently empty of the new enum values by construction).

## Interfaces
None yet — pure infra. The migration file is the interface Phase 1's `service.ts` will assume exists.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (must include the new orderExecution suite passing), `npm run build`. Migration is checked for syntactic validity with `supabase db lint` if the CLI supports it offline, otherwise reviewed by hand against `04-schema.md` line by line — cannot dry-run against a real Postgres without project credentials.

## Rollback
Migration file is inert until applied — deleting it is a full rollback. Retention/downsample change in `evaluate-triggers` is a one-line revert. No prod state is touched by this phase.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Pure infra, additive-only, 0 new services/classes. Boring by default. |
| Code quality | Pass w/ fix applied | Finding 1 (secret-in-migration) applied: cron.schedule calls moved out of the committed migration into a `.sql.example` template read at apply-time from an env var. |
| Tests | Pass w/ fix applied | Finding 3 (missing boundary/clamp cases) applied to the test list. |
| Performance | Pass | Downsample rule made concrete (finding 2) so 30-day retention doesn't unbounded-grow `price_history`. |

Scope check: 5 files touched, 0 new classes/services — well under the complexity-challenge threshold. No scope reduction needed.

VERDICT: APPROVED — proceed to build.

NO UNRESOLVED DECISIONS
