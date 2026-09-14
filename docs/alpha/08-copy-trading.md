# 08. Copy trading: follow verified top traders without fooling ourselves

Added 2026-09-14 after evaluating AlphaLedger (analytics and verification only, no copy, no API). Copy trading in ZOQO Alpha is a strategy family on existing venue adapters, not a new venue. It rides the same runner, risk gate, decision log, and leaderboard as every other strategy, so the question "does copying beat our own strategies" is answered by the same numbers.

## 1. Where source traders are observable through a free API

| Venue | What is public | How we read it | Adapter |
|---|---|---|---|
| Polymarket | Every wallet's positions, fills, P&L; leaderboards by volume and profit | Data API (`data-api.polymarket.com`: `/positions?user=`, `/activity?user=`, `/trades?user=`, leaderboard endpoints), CLOB for the book. No key. | `polymarket-sim` (fills simulated against the real book) |
| Manifold | Every user's bets and portfolio; leaderboards | `/v0/bets?username=`, `/v0/user/{username}`, `/v0/leaderboard`. Free key. | `manifold` (real play-money execution) |
| Bybit | Copy-trading master leaderboard and master positions | v5 copy-trading endpoints (needs a funded live account for the follow side; demo does not cover it) | read-only source signals only in this program |
| Kalshi | Nothing per-user | none | not applicable |
| Bookmakers | Nothing | none | not applicable |

Phase 1 of copy trading is Polymarket sim plus Manifold. That is enough to prove the mechanism on real order books and real settlements with zero money.

## 2. Source selection (the part everyone gets wrong)

Leaderboard rank is mostly luck plus size. Selection is a scored screen, recomputed nightly by `alpha-evaluate`, stored in `alpha_copy_sources`:

- Minimum history: 200 resolved bets or trades, at least 90 days active, activity in the last 14 days.
- Skill metrics, not P&L: Brier score or CLV of the trader's entries versus the market price at entry and at resolution (we can compute this from their fills and the market history we already snapshot), profit factor, drawdown, consistency (share of profitable months), and average edge per trade at entry.
- Copyability metrics: median trade size relative to market depth at the time (a whale whose fills move the book cannot be copied at their price), median time between their fill and the next 5 percent book move (if the edge is gone in seconds, following is pointless), concentration (one lucky market versus many).
- Stability: the score is computed on a rolling 90-day window and the source must stay above threshold for two consecutive weeks before it is followable. Sources drop when the window score falls below threshold, with a cooldown before re-entry.
- Diversification: cap the number of followed sources per venue and cap correlation between followed sources (positions on the same market count once).

Every source has a page on `/alpha` showing these numbers, and the MCP exposes them. Selecting is a proposal the human confirms the first time; after that the nightly job maintains the set within the confirmed parameters.

## 3. Replication (honest paper execution)

- Detection lag: poll each followed source at the adapter's polite cadence (Polymarket Data API every 60 s, Manifold every 60 s). Record the source fill timestamp and our detection timestamp; the difference is stored on the decision as `lag_ms` and is never assumed zero.
- Price at follow: the intent is priced at our detection time against the live book, never at the source's price. For `polymarket-sim`, the fill simulator walks the current book with our size. For Manifold, it is a real bet, so the price is real.
- Sizing: proportional to the source's fraction of their own bankroll, scaled to the strategy budget, then through the normal risk gate (Kelly cap, per-market exposure, daily caps). Never mirror absolute size.
- Filters before following a fill: minimum remaining time to resolution, maximum price moved since the source fill (skip if the market already moved more than X percent toward the source's side, the edge is priced in), minimum liquidity at our size, no follow if we already hold the market.
- Exits: mirror the source's exits when detected; also apply our own stop rules (max loss per position, resolution approaching) so an abandoned source position does not become ours forever.
- Everything logs `source_id`, `source_fill_price`, `our_fill_price`, `lag_ms`, `slippage_bps` on the decision row.

## 4. Measurement (does copying capture the edge)

Nightly, per source and per copy strategy:

- Source return on the same set of trades versus our return on the copies. The gap is the copy cost. Track it as a distribution, not an average.
- Our CLV on copied entries versus the source's CLV. If ours is near zero while theirs is positive, the edge decays faster than our lag; drop the source or tighten filters.
- Copy strategies sit on the same leaderboard as every other strategy with the same ROI CI, Brier, drawdown, and sample-size rules, and the same budget re-allocation. A copy strategy that does not beat the control is paused like any other.
- A `copy-random-control` strategy follows randomly chosen active accounts with the same mechanics. If the selected sources do not beat the random control on CLV over 200+ copies, source selection has no skill and the page says so.

## 5. Learning from them, not just copying

Because every source fill is logged with the market features we already compute (price, spread, depth, time to close, momentum, cross-venue divergence), the weekly param search can fit a simple model of "what do the good sources do": which market types, at what prices, how early, how large. That model becomes a candidate strategy of our own (`learned-from-sources`) that trades on the pattern rather than on the person, evaluated exactly like the rest. This is the real payoff: sources come and go; a pattern with positive CLV is ours.

## 6. Schema additions

```sql
create table alpha_copy_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  venue         text not null,
  source_ref    text not null,               -- wallet address or username
  label         text,
  status        text not null check (status in ('candidate','followed','dropped','blocked')) default 'candidate',
  score         numeric(8,4),
  metrics       jsonb not null default '{}', -- n, brier, clv, pf, dd, consistency, copyability, correlation
  first_seen    timestamptz not null default now(),
  followed_since timestamptz,
  dropped_at    timestamptz,
  unique (user_id, venue, source_ref)
);
create table alpha_source_fills (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid not null references alpha_copy_sources(id) on delete cascade,
  venue_trade_id text not null,
  market_id     text not null,
  outcome_id    text,
  side          text not null,
  price         numeric(20,8) not null,
  size          numeric(20,8) not null,
  filled_at     timestamptz not null,
  detected_at   timestamptz not null default now(),
  features      jsonb,
  unique (source_id, venue_trade_id)
);
alter table alpha_decisions add column source_id uuid references alpha_copy_sources(id);
alter table alpha_decisions add column lag_ms int;
alter table alpha_decisions add column slippage_bps numeric(10,4);
```

RLS: own rows only on both tables, same as the rest.

## 7. Strategies

- `polymarket-copy-sources` (polymarket-sim): follow the confirmed source set with the replication rules above.
- `manifold-copy-sources` (manifold): same on real play money.
- `copy-random-control` (both): random active accounts, same mechanics.
- `learned-from-sources` (both, phase 2): trades the fitted pattern, no source dependency.

## 8. MCP tools

`list_copy_sources({venue?, status?})`, `get_copy_source({id})` (metrics, recent fills, our copies and gap), `propose_copy_sources({venue})` (runs the screen now, returns candidates), `set_copy_source_status({id, status})` [manage], `get_copy_gap({strategyId})` (source vs our returns, CLV gap, lag distribution).

## 9. What "fully right" looks like on the page

A source card that shows n, Brier/CLV, drawdown, copyability, and days followed. A copy strategy row on the leaderboard beside your own strategies and beside the random control. A gap chart: source CLV versus our CLV over time. If copying is working, the gap is small and both are positive. If it is not, the page says so before any real money exists. That is the whole point of doing it in paper first.
