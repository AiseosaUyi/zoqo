# ZOQO Alpha: build status

Running record kept current by every phase of `docs/alpha/PROMPT-build-alpha.md`. Created in Phase 0, 2026-09-13.

## Environment reality check (read this first)

This build environment has **no live Supabase project link and no venue API credentials**. `.env.local` has every Alpha-relevant var blank; pulling the real production Supabase env vars via `vercel env pull` was denied by the permission classifier (pulling production secrets into a local file is exactly the kind of action that should get a human's eyes, not an autonomous pull). Consequences, applied consistently across every phase below:

- Migrations are **written and reviewed, not applied** to any live database. `supabase/migrations/20260913152606_alpha_phase0.sql` is ready to run once a human links the project.
- `cron.schedule()` calls are **not** in the committed migration (they'd embed `CRON_SECRET` as a plain-text SQL literal — see `docs/alpha/plans/phase-0-infra.md`'s review report). They live in `supabase/alpha-cron-apply.sql.example`, a template to fill in and run by hand, gitignored once filled in.
- `database.types.ts` was **hand-augmented** for the new tables (can't run `supabase gen types --linked` without a project link) — regenerate for real once linked, and diff against the hand-written version.
- Every venue adapter beyond `zoqoTerminal` (Manifold, Kalshi demo, Bybit demo, Deriv, Polymarket) and the football data feeds (odds-api.io, API-Football) is built against their **documented** APIs with **no live credential to test against**. Each such adapter's conformance test is `skip`-marked with the reason, per `07-build-plan.md`'s standing rule.
- Local verification (`tsc`, `lint`, `test:unit`, `next build`) does not require the backend — `NEXT_PUBLIC_BACKEND_ENABLED` is unset by default and the whole app (including `/alpha`) must still build and run in the localStorage-only path. This is the verification bar actually met at every phase; live-runtime acceptance criteria from `07-build-plan.md` (a real Manifold bet, a real cron tick, etc.) are **not** met and are listed under Needs Aise / blocked instead of claimed.

## Done

- Phase 0: migration written (14 tables, `pg_cron`/`pg_net` extensions, `api_keys`/`automations` constraint widening, `downsample_price_history()` function), `price_history` retention raised 24h → 30d with 5-minute downsampling after 48h, Vitest added (`test:unit` script) with a first suite for `orderExecution.ts` (13 tests, green), `database.types.ts` hand-augmented for the new tables. Committed `53ef2cf`.
- Phase 1: core interfaces, 7-point risk gate, Kelly sizing, `service.ts`/`runner.ts`/`settle.ts`/`evaluate.ts` (stub metrics), `zoqo-terminal` venue adapter (wraps `terminalExecution.ts` unchanged), `terminal-ma-cross` + `terminal-hourly-momentum` strategies, three cron routes, session-scoped `/api/alpha/*` CRUD, the `/alpha` page (kill switch, venues, strategies, decisions feed, events feed), and the automations `schedule`/`run-strategy` bridge. 53 Vitest tests, `tsc`/`eslint`/`playwright` (5/5)/production build all green. Committed `d16fe38`.
- Phase 6 scaffold: `alpha-worker/` README + a `if: false`-gated GitHub Actions workflow (no training code — gated on Phase 3 having 4+ weeks of real data first, per the build plan). Committed alongside Phase 1.
- Phase 2: MCP scopes generalized (`api_keys.scopes[]`, `requireScope`, settings page now issues multi-scope keys), 14 new `alpha:*` MCP tools registered, `manifold` venue adapter (REST via `fetch`, no SDK) with an honest documented approximation for share-based settlement P&L, `marketFeatures.ts`, 3 strategies (`manifold-mean-reversion`, `manifold-longshot-fade`, `manifold-control` — the last a seeded-PRNG noise baseline, not `Math.random()`), and a shared venue conformance-test harness (Manifold's 4 tests `skip` — no `MANIFOLD_API_KEY` here). `secrets.ts` implements the env-var fallback only; Vault lands in Phase 4. 57 Vitest tests (53 pass + 4 skip), `tsc`/`eslint`/`playwright` (5/5)/build all green.

## Next

- Phase 3: football data layer + NGN paper sportsbook (`docs/alpha/plans/phase-3-football.md`).

## Needs Aise (human-only, exact URLs)

1. **Link the Supabase project and apply the migration.** `supabase login` then `supabase link --project-ref vcceezcecdnftdpkhuco` (ref found in `supabase/.temp/project-ref`), then `supabase db push`. Regenerate types after: `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`.
2. **Fill in and run `supabase/alpha-cron-apply.sql.example`** (copy to `alpha-cron-apply.sql`, substitute the real site URL — `https://zoqo.vercel.app` per the linked Vercel project — and the real `CRON_SECRET`) once the migration above is applied.
3. **Confirm the Vercel plan tier** for the `zoqo` project (`aiseosauyiidahorgmailcoms-projects` team) — the CLI's project-level commands available here don't surface it. If Hobby, `vercel.ts`'s per-minute cron entries are a no-op in production regardless of this program (see `01-platform-digest.md` §4); pg_cron is the real scheduler either way, so this mostly affects whether to also fix the existing `evaluate-triggers`/`daily-digest` Vercel cron entries.
4. **Configure Supabase custom SMTP** (existing TODOS item, blocks new sign-ups in prod at the default 2 emails/hour cap) — Supabase dashboard → Project Settings → Auth → SMTP Settings.
5. **Obtain free API keys** and add them as Vercel env vars + `.env.local` for local dev, needed starting Phase 2/3:
   - Manifold: https://manifold.markets/ → profile → API key.
   - Kalshi demo: https://demo.kalshi.co (separate account from production Kalshi).
   - Bybit demo: https://api-demo.bybit.com (testnet/demo account creation).
   - Deriv: https://developers.deriv.com/ → register an app, get a virtual-account API token.
   - odds-api.io: https://odds-api.io/ → free tier signup (choose Bet9ja + SportyBet as the 2 free books).
   - API-Football: https://www.api-football.com/ (api-sports.io) → free tier signup.
