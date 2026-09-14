# Phase 8 plan: copy trading

Driven by `docs/alpha/08-copy-trading.md` (the spec) and section 6 of `docs/alpha/PROMPT-alpha-finish.md`. Built as a strategy family on the existing `polymarket-sim` and `manifold` adapters — no new venue, per the spec's own framing ("rides the same runner, risk gate, decision log, and leaderboard as every other strategy").

## Goal
Follow verified top traders on Polymarket (real, public, keyless leaderboard) and Manifold (real, public, keyless per-user bets — no public leaderboard endpoint, see below) without fooling ourselves: a scored nightly screen, honest lag/slippage logging on every copied decision, and a random-account control every copy strategy must beat.

## Scope in
- `supabase/migrations/20260914020000_alpha_copy_trading.sql`: `alpha_copy_sources`, `alpha_source_fills`, 3 new `alpha_decisions` columns (`source_id`, `lag_ms`, `slippage_bps`), RLS own-rows-only on both new tables. `database.types.ts` hand-augmented for the same reason Phase 0/the Vault migration used the same convention (see Data changes below).
- `src/lib/alpha/copy/sources.ts`: `scoreSource` (pure) — Brier, a resolution-based CLV proxy, profit factor, max drawdown, consistency, copyability, market concentration; `updateStability` (pure) — the two-consecutive-weeks-above-threshold rule from §2; `runSourceScreen` — the DB-touching wrapper the evaluator/MCP call.
- `src/lib/alpha/copy/follow.ts`: `detectPolymarketFills`/`detectManifoldFills` (real, live, keyless fill detection), `discoverPolymarketCandidates` (real, live, keyless leaderboard), `discoverManifoldCandidates` (returns `[]` — see Non-obvious finding below), `sizeCopyIntent`/`shouldFollowFill`/`computeSlippageBps` (pure).
- `src/lib/alpha/copy/gap.ts`: `computeCopyGap` (pure) — extracted so the nightly-measurement math is unit-tested without a Supabase client, same split as `sources.ts`.
- `src/lib/alpha/strategies/lib/copyTrading.ts` + 4 registered strategies: `polymarket-copy-sources`, `manifold-copy-sources`, `copy-random-control` (works on either venue via `ctx.venue.id`), `learned-from-sources` (a genuine phase-2 stub, per the spec's own "(both, phase 2)" framing — registered now for a stable key, does nothing until 200+ real copies exist to fit against).
- `core/strategy.ts`: `StrategyCtx` gains an optional `supabase` field (populated by `runner.ts`) — copy strategies need direct reads of their own tables; every existing strategy is unaffected (field is optional, unused by them).
- `core/venue.ts`: `Intent` gains an optional `copyMeta: {sourceId, lagMs, slippageBps}`, persisted by `service.executeIntent` onto the 3 new `alpha_decisions` columns.
- `evaluate.ts`: nightly copy-gap logging per copy-strategy instance (an `alpha_events` `info` row, not a new `alpha_strategy_stats` column) — the same numbers `get_copy_gap` computes on demand, captured once a day for a visible history.
- 5 MCP tools (`list_copy_sources`, `get_copy_source`, `propose_copy_sources`, `set_copy_source_status`, `get_copy_gap`) + matching `/api/alpha/copy-sources[/[id]]` routes + a `/alpha` copy-sources tab (source cards, propose form with a venue picker and a manual-username field for Manifold, follow/drop buttons).
- Vitest: `copy-sources.test.ts` (scoring + stability), `copy-follow.test.ts` (sizing + filters + slippage, **plus a live, unconditional conformance test against a real top Polymarket wallet**), `copy-gap.test.ts` (gap math).

## Scope out
The gap *chart* (source CLV vs our CLV over time, §9's visual) — `get_copy_gap`'s numbers exist and are logged nightly, but charting them is deferred until real copy volume exists to chart (an empty/synthetic chart would be decorative). Resolution-linking a detected fill back to the source's own settlement (see Non-obvious finding below) — phase 2, needed before the skill-based score components are trustworthy on real candidates.

## Non-obvious findings (checked live, not assumed)
- **Manifold has no public profit leaderboard endpoint.** Verified live: `GET /v0/leaderboards` 404s, and it's absent from the documented endpoint list (`docs.manifold.markets/api`) entirely — confirmed by fetching that list and diffing against every other real endpoint used elsewhere in this program. `/v0/users` exists but returns signup-order, not profit-ranked. Real candidate discovery for Manifold is therefore manual: `propose_copy_sources`/the UI's `candidateRefs` override is the actual path, not a gap in this implementation.
- **A real top Polymarket wallet was used to build and verify the live conformance test**: `0x204f72f35326db932158cba6adff0b9a1da95e14` ("swisstony"), found via the real `https://lb-api.polymarket.com/profit?window=all&limit=5` leaderboard, $23.6M lifetime profit at time of writing. Hardcoded in the test (not re-fetched per run) so the test doesn't depend on that wallet still holding #1.
- **Fills detected via the real APIs are logged unresolved** (no `won`/`pnl` — resolution-linking a source's specific fill to the venue's own settlement feed isn't built). This means `scoreSource`'s skill components (Brier/CLV-proxy/profit-factor/consistency) will under-score every REAL candidate `propose_copy_sources` screens today, even though the pure scoring math itself is fully correct and tested (proven on synthetic fixtures with real resolutions). `copyability` and history-length/recency still score correctly on real data. Named explicitly here and in STATUS.md rather than silently shipped.

## Data changes
Two new tables + 3 new `alpha_decisions` columns, per `08-copy-trading.md` §6's own SQL verbatim (migration file above). **Not applied this session** — no `SUPABASE_ACCESS_TOKEN`/direct Postgres connection string available (same documented gap as `20260914010000_alpha_vault_secrets.sql` from this same session's earlier section 3 — see STATUS.md's environment-reality-check and Needs Aise list). Every write path (the screen persisting to `alpha_copy_sources`, fill detection persisting to `alpha_source_fills`, `executeIntent` persisting `copyMeta`) is code-complete and unit-tested on its pure logic, but genuinely untested against a live table until the migration lands — that is the one item in the user's "Done means" list this plan cannot claim today, named plainly rather than glossed over.

## Interfaces
`StrategyCtx.supabase` (optional) and `Intent.copyMeta` (optional) are the two additive, backward-compatible contract changes — every strategy and every intent built before this phase compiles and behaves identically (verified: full `tsc`/`test:unit`/`playwright`/`build` green with zero changes needed to any pre-existing strategy file).

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (pure scoring/sizing/filter/gap math + the real, unconditional, live Polymarket fill-detection conformance test — this is the one piece of this plan that IS fully verified against the real world today, independent of the migration gap above), `npx playwright test`, `npm run build`.

## Rollback
Additive only — no existing table, strategy, or MCP tool is modified. Reverting means dropping the 4 new files under `copy/`, the 4 new strategy files + their registry entries, the 5 new MCP tools + routes, the UI tab, and the `evaluate.ts`/`core/*.ts` additive hooks — none of it is load-bearing for anything that existed before this phase.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Strategy family on existing adapters, not a new venue — matches the spec's own explicit framing. `StrategyCtx.supabase`/`Intent.copyMeta` are the minimal, additive extensions needed; both were checked against every pre-existing strategy/intent call site (`tsc`/full test suite green) rather than assumed safe. |
| Code quality | Pass, with named gaps | Two real, load-bearing gaps are named in-code and in this doc rather than hidden: (1) no live table to test writes against (environment-caused, not a code defect — same class of gap this session already established a precedent for handling honestly in section 3's Vault migration), (2) fills logged unresolved, so real-candidate skill scoring under-scores until resolution-linking exists (phase-2-shaped, matches the spec's own "learned-from-sources... phase 2" pattern of deferring exactly this kind of maturity gate). Manifold's missing leaderboard endpoint was verified live before writing the "returns []" fallback, not assumed. |
| Tests | Pass | Scoring, stability, sizing, filters, slippage, and gap math are all pure and unit-tested including edge cases (zero bankroll, all-unsettled outcomes, concentration penalty, tie-breaking). The one explicitly required live test (real fill detection against a real top wallet, no key) is unconditional — not gated behind an env var — and passes against the real network. |
| Performance | Pass | Detection polls per followed source per strategy tick (interval-scheduled, default 5 min) — bounded by however many sources a user actually follows, no unbounded fan-out. |

Scope check: matches `docs/alpha/08-copy-trading.md` and section 6 of `docs/alpha/PROMPT-alpha-finish.md` exactly, with the two named gaps above (migration-apply, resolution-linking) as the only deviations from "fully done" — both are named, both are the smallest possible cut given this session's real environment constraints, and both have a clear "what unblocks this" path recorded in STATUS.md.

VERDICT: APPROVED — proceed to `/plan-design-review` for the `/alpha` copy tab, then to final verification and commit.

NO UNRESOLVED DECISIONS

## Design review (the `/alpha` copy-sources tab — the only UI surface this phase touches)

Scope: one new section on an already-designed page (`/alpha` already has Venues/Strategies/Fixtures/Proposals sections in the same visual language) — this is incremental extension, not new IA, matching this session's earlier design-review precedent (phase-7-finish.md's own nav design pass) for the same reasoning: full mockup-generation tooling is disproportionate to one more card-list section on an existing dashboard using existing primitives verbatim.

- **Source card**: matches `ProposalsInbox.tsx`'s card shape exactly (label/venue/status tags, a metrics row, action buttons on the right) — n/resolved, Brier, profit factor, copyability, consistency, and the composite score, in one `text-[11.5px] text-sub` grid row, same density convention as `KillSwitchCard`/`VenuesSection`. Status tag color reuses the existing `up`/`down`/`gray` `Tag` palette (`followed`=up, `dropped`/`blocked`=down, `candidate`=gray) — no new color introduced.
- **Propose form**: a venue `Select` (existing primitive) plus a conditional `Input` for Manifold's manual username — the field only appears for Manifold, so a first-time user isn't shown an input box that's meaningless for Polymarket. Button disables while screening is in flight (`proposing` state) and while Manifold's required username field is empty, rather than allowing a submit that would silently no-op.
- **Empty state**: reuses the existing `EmptyState` primitive (icon + title + description) with copy that tells the user exactly why the two venues behave differently (auto-discovery vs manual username) — not a generic "no data" message.
- **Confirm-the-first-time flow** (§2's explicit requirement): a `candidate` source shows Follow/Block; a `followed` source shows Drop — the human-confirmation step is a single obvious button, not a settings toggle buried elsewhere.
- **Deferred, named**: the gap chart (§9's "source CLV versus our CLV over time" visual) — `get_copy_gap` computes real numbers today, but there's no real copy volume yet to make a chart meaningful; building one now would be decorative, not informative. Revisit once `alpha_source_fills`/copied decisions exist for real (i.e., once the migration lands and a user actually follows a source).

### GSTACK REVIEW REPORT (design)

| Pass | Status | Findings |
|---|---|---|
| Information architecture | Pass | One more section in an already-flat, already-understood `/alpha` page layout — no new navigation pattern. |
| Empty/edge states | Pass | Empty state explains the Polymarket/Manifold asymmetry rather than a generic "nothing here"; disabled-button states cover the "Manifold with no username" and "screening in progress" cases explicitly. |
| Consistency with design system | Pass | Every element (Card, Tag, Select, Input, Button, EmptyState) is an existing primitive reused verbatim — zero new tokens, colors, or radii. |
| Mobile/responsive | Pass | Metrics grid is `grid-cols-2 sm:grid-cols-4` (stacks on narrow viewports), matching the existing responsive convention used elsewhere on `/alpha`. |
| AI-slop risk | Pass | No decorative chart, no hero, no card-grid-for-its-own-sake — plain data rows and two buttons, appropriate density for a dashboard section. |

Scope check: matches the one UI surface this phase touches; the gap chart's deferral is named above, not silently dropped.

VERDICT: APPROVED — proceed to build verification and commit.

NO UNRESOLVED DECISIONS
