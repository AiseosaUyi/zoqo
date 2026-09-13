# 06. Football model: data, features, models, evaluation

Goal is not "predict matches". Goal is "find and size bets where our calibrated probability beats the Bet9ja/SportyBet line by more than the margin, and prove it with CLV before any real Naira is involved."

## 1. Data pipeline (`alpha-ingest`, every 15 min)

1. **Fixtures**: API-Football `/fixtures?league=&season=&from=&to=` for leagues in `alpha_settings.leagues`, 7 days ahead. Upsert `alpha_fixtures`. Budget: 100 req/day free. Plan the calls: 1 per league per day for fixtures, 1 per fixture for lineups in the last 90 min before kickoff, 1 per fixture for result after FT, injuries 1 per league per day. With 7 leagues and ~40 fixtures/week this fits; the token bucket in `alpha_rate_budget` enforces it and the ingest job prioritizes fixtures closest to kickoff.
2. **Odds**: odds-api.io for Bet9ja and SportyBet (the 2 free books) per fixture, markets 1X2, O/U 2.5, BTTS, double chance. Snapshot cadence: every 15 min inside 48 h, every 5 min inside 2 h, final snapshot in the 5 min before kickoff = closing line. Budget 100/hr, 500/day: at 5 min cadence in the last 2 h that is 24 calls per fixture; the job caps concurrent "hot" fixtures at the budget and degrades to 15 min. Store every snapshot; never overwrite.
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
