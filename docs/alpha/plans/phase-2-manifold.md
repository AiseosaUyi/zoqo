# Phase 2 plan: Manifold adapter, prediction-market strategies, MCP v2 scaffolding

## Goal
Add the first real external venue with a real (if play-money) API, proving the whole loop end to end against something outside this codebase, and open the control surface up to an external agent via the MCP.

## Scope in
- `src/lib/alpha/venues/manifold.ts` — `VenueAdapter` over Manifold's REST API (`GET /v0/markets`, `GET /v0/market/{id}`, `POST /v0/bet`, `GET /v0/bets`). API key read via `getVenueSecret(userId, "manifold")` (new: `src/lib/alpha/secrets.ts` — Vault-backed with an env-var fallback for the single-user phase, per `03-architecture.md` §3; Phase 2 implements the env-var fallback path fully and stubs the Vault path with a clear "not implemented — set `MANIFOLD_API_KEY` for now" error rather than pretending Vault access works without it existing).
- `src/lib/alpha/features/marketFeatures.ts` — mid, spread, 24h volume, time-to-close, momentum, from Manifold's market payload (no cross-venue divergence yet — that needs `alpha_market_links`, Phase 4).
- Strategies: `manifold-mean-reversion`, `manifold-longshot-fade`, `manifold-control` (`06-football-model.md`-style: the control strategy places small deterministic bets and exists so the leaderboard can show "is this actually better than noise").
- MCP v2 scaffolding: `api_keys.scopes` migration already exists (Phase 0); add `requireScope(ctx, scope)` to `src/lib/mcp/auth.ts` (generalizing today's `requireTrade`), new file `src/lib/mcp/alphaTools.ts` registered in `src/app/api/mcp/route.ts` alongside the 12 existing tools (untouched). Tools this phase: `list_venues`, `set_venue`, `search_markets`, `get_quote_v2`, `list_strategy_templates`, `list_strategies`, `create_strategy`, `update_strategy`, `pause_strategy`, `resume_strategy`, `run_strategy_now`, `list_decisions`, `get_leaderboard`, `kill_switch` — all thin wrappers over `service.ts`, per `05-mcp-spec.md`.
- Conformance: `src/lib/alpha/venues/__tests__/conformance.ts` — a shared test factory (`runConformanceSuite(adapter, opts)`) every adapter's own test file imports and runs; Manifold's suite either runs for real against a live key (env `MANIFOLD_API_KEY` present) or is `it.skip`'d with the reason logged, per the standing rule.

## Scope out
Football (Phase 3). Kalshi/Bybit/Deriv/Polymarket (Phase 4). Cross-venue market matching (`alpha_market_links`) — Phase 4, once there's more than one prediction-market venue to match against.

## Files touched
`src/lib/alpha/venues/manifold.ts`, `src/lib/alpha/secrets.ts`, `src/lib/alpha/features/marketFeatures.ts`, `src/lib/alpha/strategies/{manifoldMeanReversion,manifoldLongshotFade,manifoldControl}.ts` (+ registry update), `src/lib/mcp/auth.ts` (extend), `src/lib/mcp/alphaTools.ts` (new), `src/app/api/mcp/route.ts` (register), `src/lib/alpha/venues/__tests__/{conformance,manifold}.test.ts`, `src/components/alpha/*` (extend venues list + leaderboard now that a second venue exists), `supabase/migrations/<ts>_alpha_phase2.sql` if any schema gap surfaces while implementing (expected: none — Phase 0's schema already covers this).

## Data changes
None expected beyond what Phase 0 already added.

## Interfaces
`VenueAdapter` unchanged — Manifold implements exactly the Phase 1 interface. MCP tool signatures follow `05-mcp-spec.md` verbatim.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (conformance suite skip-marked without a key, real run if `MANIFOLD_API_KEY` is ever provided), `npm run build`. Live acceptance (a real mana bet visible on manifold.markets) requires a Manifold API key this environment doesn't have — recorded in STATUS.md as blocked-on-credentials, not claimed. An MCP client (Claude Code with a scoped key) exercising `list_venues`/`create_strategy`/`kill_switch` is the same story — needs a live Supabase-backed session this environment can't provide; the tools are built and typecheck, but end-to-end MCP exercise is a Needs Aise item until a key exists.

## Rollback
Additive only — new venue module, new strategies, new MCP tool file. Deleting them plus the `route.ts` registration lines is a full rollback with zero effect on the 12 existing MCP tools or Phase 1's terminal venue.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Reuses the exact Phase 1 `VenueAdapter`/risk-gate/runner spine — no new orchestration machinery for a second venue, which is the point of the interface. |
| Code quality | Pass w/ note | `secrets.ts`'s Vault path is explicitly stubbed rather than faked — an honest "not implemented" beats a silently-broken Vault call, given this environment can't provision Vault secrets to test against either way. |
| Tests | Pass w/ gap noted | Conformance suite is real but will `skip` without `MANIFOLD_API_KEY` — flagged up front rather than discovered at review time. |
| Performance | Pass | No new hot paths; Manifold calls are bounded per-strategy-run like the terminal adapter. |

Scope check: ~10 new files, reusing established patterns — no scope reduction needed.

VERDICT: APPROVED — proceed to build once Phase 1 is verified green.

NO UNRESOLVED DECISIONS
