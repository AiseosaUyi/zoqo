# Phase 4 plan: Kalshi demo, Bybit demo, Deriv virtual, Polymarket sim

## Goal
Round out the venue roster to five so the leaderboard is genuinely cross-venue, and add the credentials manager the program has needed since Phase 2 introduced its first external API key.

## Scope in
- `src/lib/alpha/venues/{kalshiDemo,bybitDemo,derivVirtual,polymarketSim}.ts` — four adapters against their documented APIs (`02-market-landscape.md` §4): Kalshi demo (RSA-PSS signed REST), Bybit demo (HMAC-signed v5 REST), Deriv (WebSocket, virtual account token), Polymarket (Gamma read + CLOB read, fills simulated via a ported level-by-level order-book replay — cite `agent-next/polymarket-paper-trader` per the hard rule on borrowing).
- `src/lib/alpha/secrets.ts` extended: real per-user credential storage via `broker_credentials.secret_ref` + Supabase Vault, finally wiring up the placeholder table `01-platform-digest.md` §2 flags as unused. Env-var fallback from Phase 2 stays for local dev.
- Strategies: `kalshi-cross-venue-divergence` (needs `alpha_market_links` — build the matching job here, first phase with 2+ prediction-market venues to match), `bybit-hourly-momentum` (reuses `terminalHourlyMomentum`'s logic against a different venue — factor the shared math into `src/lib/alpha/strategies/lib/momentum.ts` rather than copy-pasting the file, since DRY matters and this is the second consumer), `deriv-synthetic-meanrev`, `polymarket-sim-longshot-fade`.
- `src/lib/alpha/venues/__tests__/conformance.ts` (built in Phase 2) now runs against all 5 adapters — real runs where a key exists, `skip`-with-reason otherwise.
- `/alpha` credentials manager: per-venue key entry, calls `set_venue_credentials` (MCP tool, `alpha:credentials` scope), never displays a stored secret back, only a key prefix — mirrors the existing `api_keys`/`broker_credentials` UI pattern already in `/settings`.

## Scope out
Anything beyond these four venues. Live-money placement of any kind (permanently out of scope for this whole program).

## Files touched
The four adapter files, `secrets.ts` (extend), `src/lib/alpha/marketMatching.ts` (new, for `alpha_market_links`), 4 new strategy files + the factored `momentum.ts` shared module, conformance test extension, `/alpha` credentials component, `src/app/api/alpha/credentials/route.ts`.

## Data changes
None beyond Phase 0's `alpha_market_links`/`broker_credentials` (already exists pre-Alpha) — this phase is the first to actually write to both.

## Interfaces
Unchanged `VenueAdapter` — these four are proof the interface generalizes past the two venue "shapes" (price-quoted, odds-quoted) already exercised by Phase 1-3.

## Verification
`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` (conformance suite, mostly skip-marked without credentials — Kalshi/Bybit/Deriv/Polymarket keys are all Needs Aise items per `docs/alpha/STATUS.md`), `npm run build`. The acceptance bar in `07-build-plan.md` ("leaderboard ranks strategies across five venues") is achievable structurally (the leaderboard code doesn't care how many venues have real data) but only shows real numbers for venues with live credentials — recorded honestly, not padded with synthetic data to look complete.

## Rollback
Additive only. Deleting the four adapter files, their strategies, and the credentials route/component is a full rollback.

## GSTACK REVIEW REPORT

| Section | Status | Findings |
|---|---|---|
| Architecture | Pass | Fifth+ venue proves the adapter interface generalizes rather than needing venue-specific runner branches. |
| Code quality | Pass w/ fix applied | Original draft would have copy-pasted `terminalHourlyMomentum`'s window/ATR logic into `bybitHourlyMomentum` — flagged as a DRY violation and factored into a shared `strategies/lib/momentum.ts` instead, consumed by both. |
| Tests | Pass w/ gap noted | Conformance suite depends entirely on credentials this environment doesn't have — every adapter beyond structural/type correctness is unverified live; explicitly not overstated as "tested." |
| Performance | Pass | No new hot paths. |

Scope check: 4 adapters is exactly what `07-build-plan.md` scopes for this phase; no reduction or expansion warranted.

VERDICT: APPROVED — proceed to build once Phase 3 is verified green.

NO UNRESOLVED DECISIONS
