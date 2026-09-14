# 06. Football model: data, features, models, evaluation

Goal is not "predict matches". Goal is "find and size bets where our calibrated probability beats the Bet9ja/Nairabet line by more than the margin, and prove it with CLV before any real Naira is involved." (SportyBet was the original odds-api.io plan's second book; odds-api.io is retired — see §1 — and Nairabet is its keyless replacement.)

## 1. Data pipeline (`alpha-ingest`, every 15 min)

1. **Fixtures** (updated 2026-09-14, live-verified): `API-Football`'s documented `/fixtures?league=&season=&from=&to=` combo is **rejected on the free plan for any season after 2024** — confirmed live: `{"errors":{"season":"Free plans do not have access to this season, try from 2022 to 2024."}}`. `providers/apiFootball.ts`'s `fetchFixturesByDateRange` works around this with date-only `GET /fixtures?date=` calls (no season restriction, confirmed live returning real current fixtures — e.g. a real EPL match and real Serie A matches on 2026-09-14, cross-confirmed against Bet9ja's own live feed for the same EPL match), one real call per calendar day in the lookahead window, filtered client-side to the configured leagues. `alpha-ingest`'s route calls this ONCE per tick (not once per league — the date endpoint returns every league at once) and gates it to once per 3 hours via the same `alpha_rate_budget` token bucket, since refreshing on every 15-minute tick would burn the shared 100/day budget in under 2 hours. Lineups 1 per fixture in the last 90 min before kickoff, results 1 per fixture after FT, injuries 1 per league per day still apply as documented, sharing the same daily budget.
2. **Odds** (updated 2026-09-13, docs/alpha/PROMPT-alpha-finish.md §4 — **odds-api.io's free tier is confirmed paused indefinitely, retired**): `src/lib/alpha/providers/bet9jaPublic.ts` and `nairabetPublic.ts` — keyless ports of `jayteealao/NaijaBet_Api` (MIT, commit `0ae335dc90ba390949eac0de57f3f86f537ae025`) reading the same public JSON Bet9ja's/Nairabet's own web clients load, one call per league (not per fixture — the raw feed returns every match in the league at once, matched to `alpha_fixtures` by a first-cut team-name/kickoff-time matcher, `naijaBetShared.ts`'s `matchFixture`) across 1X2, double chance, and O/U 2.5 where the JSON has them (Nairabet's feed only ever has 1X2). Plus `apiFootballOdds.ts`'s `/odds` endpoint (same account, same 100/day budget as fixtures) for the consensus/closing line, preferring 1xBet/Betway/Bet365. Snapshot cadence: every 15 min normally, every 5 min inside 2 h of kickoff, last snapshot before kickoff = closing line. Store every snapshot; never overwrite. A 403/429 or an unexpected response shape trips a 24 h circuit breaker per provider (reuses `alpha_rate_budget`'s existing columns — visible via `get_health`) rather than hammering a blocked or changed endpoint every tick. **Reading Bet9ja's/Nairabet's public odds JSON this way is plausibly extraction under Bet9ja's own T&Cs clause IV(4) (docs/alpha/02-market-landscape.md §1) — read-only, low-cadence, never places a bet, and running it at all is Aise's call, not a decision this codebase makes silently.** Bet9ja verified live from this machine 2026-09-13 (real current EPL fixtures parsed correctly); Nairabet's endpoint doesn't resolve from this development sandbox specifically (DNS — see `nairabetPublic.ts`'s header for the evidence) and is unverified live pending a real deploy.
3. **Results**: API-Football fixture status polling after kickoff + 105 min, then every 10 min until FT.
4. **Lineups and injuries**: `/fixtures/lineups`, `/injuries?fixture=`. Stored as jsonb on the fixture.
5. **Ratings** (phase 1 in TS): after every FT result, update ELO (K=20, home adv 60 Elo points, goal-difference multiplier as in ClubElo) and refit Dixon-Coles weekly on the last 4 seasons with time decay ξ=0.001 per day. Phase 3: replace with ClubElo pulls and `penaltyblog` fits from the Python worker, plus Understat xG.

## 2. Feature vector (`fixtureFeatures.ts`)

Market features (strongest):
- Implied probabilities per book with margin removed (multiplicative normalization and Shin's method; store both), consensus = mean across books.
- Overround per book; the smaller the margin, the sharper the line.
- Line movement: consensus prob now vs opening snapshot, vs 24 h ago, vs 2 h ago.
- Cross-book divergence (Bet9ja vs SportyBet on the same outcome): a source of "best price" and a sanity check.

Team strength:
- ELO home and away, ELO diff, expected result from ELO.
- Dixon-Coles attack/defence strengths, home advantage factor, implied 1X2 and O/U 2.5 and BTTS from the Poisson grid (0 to 10 goals) with the Dixon-Coles low-score correction.
- xG for/against last 5 and last 10 (phase 3), goals for/against last 5 and last 10 (phase 1).
- Form: points per game last 5 and 10, weighted (0.85 decay).
- Head to head last 5: not a strong predictor in the literature; include as a weak feature, expect the model to down-weight it.

Situational:
- Rest days for each team since last match; midweek European fixture flag.
- Lineup known flag; number of starters missing versus the previous match; injuries count; "key player out" flag (a top-3 player by minutes or goals in the last 10 matches is absent).
- Competition stage (league, cup, dead rubber heuristic: nothing to play for in the last 5 rounds).
- Referee cards/penalties per game where available (Sportmonks later).
- Kickoff hour, day of week (weak).

Every feature is computed from data available **before kickoff** and stored on the decision row. No feature may read a result.

## 3. Models (in order; each is a `predict_fixture` `model` option)

1. `market`: consensus implied probability. This is the baseline everything must beat. It will usually win on accuracy.
2. `dixon-coles`: pure model probabilities from the Poisson grid.
3. `elo`: logistic on ELO diff (draw share by a fitted constant per league).
4. `blend`: `p = w·market + (1-w)·dixon-coles` with w fitted per league by minimizing RPS on a walk-forward holdout (expect w around 0.7 to 0.85). This is the default for betting.
5. `ml` (phase 3, Python): CatBoost on the full vector including pi-ratings and xG, target = 1X2, calibrated with isotonic regression, evaluated on RPS and CLV against `blend`. Promoted only if CLV improves on the holdout.

Betting rule per outcome per book: `edge = p_model - p_book_implied_with_margin`. Bet when `edge >= min_edge` (default 2%), odds within `[1.3, max_odds]`, and the outcome is not already held. Stake by fractional Kelly on the book's decimal odds using `p_model`, capped by the risk gate. Prefer the book with the better price; store both prices.

## 4. Evaluation (nightly, and on every backtest)

- RPS (ranked probability score) for 1X2, Brier for binaries. Lower is better. Compare every model to `market` on the same fixtures.
- Calibration table per decile of predicted probability.
- CLV per bet: `closing_implied / taken_implied - 1` using the same book's closing line (positive = beat the closing line, i.e. took a lower implied probability / better price than the market settled on — corrected 2026-09-13 from an earlier draft of this line that had the ratio inverted; `03-architecture.md` §7 already stated the correct direction). Positive mean CLV with n ≥ 200 is the first real evidence of edge. ROI alone is noise at these sample sizes; the report says so on the page.
- ROI with a bootstrap 95% CI, hit rate, drawdown, longest losing run.
- Per league, per market, per book, per model breakdowns.

Publish as a Vitest fixture-based test: a frozen sample of 300 historical fixtures with snapshots and results lives in `src/lib/alpha/__fixtures__/` so the math is unit-tested and the metrics are reproducible.

## 5. Strategies shipped for football

- `football-value-1x2`: blend model vs best book price, Kelly 0.25, min edge 2%, runs T-6h and T-1h (after lineups) per fixture. Event schedule.
- `football-value-ou25`: same on over/under 2.5.
- `football-line-move`: bets with sharp line movement toward an outcome in the last 24 h when the model agrees (momentum in odds is a documented CLV source).
- `football-market-only-control`: places no bets; records what the pure market would have done. A control strategy that shows zero edge is how the page proves the others are not luck.

## 6. Honest expectations

Free data and two soft books usually yield a few percent CLV at best and roughly break-even ROI after margin. If the leaderboard shows large positive ROI on small n, treat it as noise until CLV and n confirm. The experiment is designed to find out, not to assume.
