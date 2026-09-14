# 02. Market landscape: venues, data, and what is actually accessible from Nigeria (Sept 2026)

Researched 2026-09-13. Every claim has a source in the list at the bottom. This file exists so the build never has to re-research, and so the decisions below are traceable.

## 1. Nigerian football bookmakers

Traffic ranking (Semrush, July 2026): SportyBet 36.3M visits/month, Bet9ja 11.6M, Stake 8.9M, 1xBet NG 8.7M, BetKing 8.1M, MSport 2.8M, Betway NG 1.9M. Football is 75 to 85% of wagers, about 90% mobile.

**Finding that shapes everything: none of SportyBet, Bet9ja, BetKing, NairaBet, 1xBet, 22Bet, Betano, MSport, Betway NG, Parimatch publishes a developer API, sandbox, or virtual-money demo account.** Their only programmatic surfaces are affiliate tracking links.

Additional facts:

- Bet9ja T&Cs clause IV(11) prohibits "automated systems, bots, scripts, software" for placing bets and IV(4) prohibits automated extraction. Breach voids bets and closes the account. Assume every NG book has the same clause.
- Unofficial: `jayteealao/NaijaBet_Api` (30 stars) scrapes 1X2 and double chance odds from Bet9ja, NairaBet, BetKing (BetKing needs Playwright, Cloudflare). Parse.bot sells paid wrappers for sportybet.com and 1xbet.ng (odds, virtual football, bet-slip booking; 200 free credits/month).
- Naira rails at every book: bank transfer, USSD (SportyBet `*5006*ID#`), OPay, PalmPay, Paystack, Flutterwave, Quickteller. Minimum deposits around ₦100.
- **odds-api.io** is the only documented odds API that lists Bet9ja and SportyBet (plus 1xBet, 22Bet, Betano, Parimatch). Free tier: 100 req/hour, 500/day, and you choose 2 recreational books, which fits Bet9ja + SportyBet exactly.

Decision: NG bookmakers are odds-ingest only. ZOQO runs an internal Naira-denominated paper sportsbook priced from real Bet9ja/SportyBet lines and settled from real results. When (if) the user goes live, the system produces a "slip" (selections, stakes, book, the book's own odds at decision time) that a human places by hand in the app. Bookmaker booking codes are the human-in-the-loop bridge. No scraper places bets.

## 2. Exchanges and odds APIs

**Update 2026-09-13 (docs/alpha/PROMPT-alpha-finish.md §4): odds-api.io's free tier is confirmed "paused indefinitely" for new keys — checked live, not assumed. It is retired from this program** (`src/lib/alpha/providers/oddsApiIo.ts` now throws if ever called; kept in the tree only for its shared `OddsSnapshotInput` normalized types). Replaced by two keyless, public-JSON sources ported from `jayteealao/NaijaBet_Api` (MIT, commit `0ae335dc90ba390949eac0de57f3f86f537ae025` — see `src/lib/alpha/providers/{bet9jaPublic,nairabetPublic}.ts`), plus API-Football's own `/odds` endpoint (already-paid-for account, same 100/day budget as fixtures/lineups/injuries) as the consensus/closing line:

- **Bet9ja** (`sports.bet9ja.com`'s desktop `PalimpsestAjax/GetEventsInGroupV2` feed) — verified LIVE from this machine 2026-09-13: real, current English Premier League fixtures with real 1X2/double-chance/O-U-2.5 decimal odds. Reading this public JSON — the same the bookmaker's own web client loads, never anything write-side — is plausibly extraction under **Bet9ja's own T&Cs clause IV(4)** (see §1 above); it is read-only, low-cadence (≤1 req/league/15min, ≤1/5min inside 2h of kickoff), never places a bet, and running it at all is **Aise's call**, not a decision baked silently into the code.
- **Nairabet** (`sports-api.nairabet.com`'s `/v2/events` feed) — built against the same upstream library's documented shape, but **unreachable from this development sandbox** (DNS NXDOMAIN for that subdomain specifically — confirmed with `nslookup`, not a timeout; `nairabet.com` itself resolves and returns a Cloudflare-style 403). The upstream library runs a live-site CI suite against this exact endpoint and shows active maintenance as of 2026-09-13, so this is most likely a sandbox-specific DNS gap (the same class of gap CLAUDE.md already documents for Binance/Coinbase price feeds), not a dead endpoint — verify from a real deploy before trusting it in production. Same T&Cs-clause caveat applies.
- **API-Football `/odds`** (`apiFootballOdds.ts`) — the account's existing 100/day budget, included on the free plan; prefers 1xBet/Betway/Bet365 as consensus books, gives the closing line for CLV. Unverified live in this environment (no `API_FOOTBALL_KEY` — see STATUS.md), but a real HTTP 403 (not a connection failure) confirms the host is reachable and only the key is missing.

| Service | Usable from Nigeria | Free tier | Verdict |
|---|---|---|---|
| Betfair Exchange | No. Nigerian accounts closed; "not possible to connect from Nigeria" | Delayed key free | Out |
| The Odds API | Yes | 500 credits/month | Backup for EU books (1xBet appears in EU region); no NG books |
| ~~odds-api.io~~ | Yes | ~~100/hr, 500/day, 2 books~~ | **Dead — free tier paused indefinitely, confirmed 2026-09-13. Retired.** |
| **Bet9ja public JSON** | Yes | Unlimited, keyless (rate-limited by us, not them) | **Primary football odds feed** — verified live |
| **Nairabet public JSON** | Yes | Unlimited, keyless | Secondary — built, unverified from this sandbox (DNS) |
| **API-Football `/odds`** | Yes | Shares the 100/day fixtures budget | Consensus/closing line |
| OpticOdds / OddsJam | Yes | None | Out (enterprise) |
| BetsAPI | Yes, via RapidAPI | Trial | Backup |
| Sportmonks odds | Yes | 2 leagues free (Danish, Scottish) | Out for odds; maybe later for referee/xG at €29/mo |
| Pinnacle API | Shut July 2025 | None | Out |
| Cloudbet | Crypto-funded, not NG-licensed, has "Simulated Betting with Test Funds" and a Trading API after €10 deposit | Feed via affiliate token | Interesting later as a live-fire sports venue, not phase 1 |
| Stake | No public API; named on Lagos LSLGA illegal-operator list 10 Sept 2026 | None | Out |

## 3. Football data for the model

| Source | Free tier | Gives | Verdict |
|---|---|---|---|
| API-Football (api-sports.io) | 100 req/day, all endpoints, all competitions, **but `league=&season=` fixture/odds queries reject any season after 2024** (confirmed live 2026-09-14: `{"errors":{"season":"Free plans do not have access to this season, try from 2022 to 2024."}}`) — worked around via date-only `GET /fixtures?date=` queries, which have no such restriction (see `providers/apiFootball.ts`'s `fetchFixturesByDateRange`) | fixtures, lineups, injuries, player stats, H2H, standings, pre-match and in-play odds; no xG | **Primary fixtures + lineups + injuries + results feed**, via the date-query workaround above. $19/mo for 7.5k/day (and, per this finding, presumably current-season access) if needed |
| football-data.org | 12 competitions, 10 calls/min, delayed | fixtures, results, standings | Backup results feed |
| `probberechts/soccerdata` (Python, 1.9k stars, Apache-2.0) | Free scraping | Understat xG, FBref, ClubElo ratings, Football-Data.co.uk closing odds, WhoScored ratings, Sofascore | **xG, ELO, closing-line history.** Python only |
| StatsBomb open-data (3.3k stars) | Free, attribution | event-level history with shot xG | Offline training only |
| Sportmonks | 2 leagues free | referee, xG, lineups, injuries | Upgrade path |
| Opta / Stats Perform | Enterprise | everything | Out |

## 4. Live-fire venues with real APIs and zero real money (all confirmed reachable from Nigeria)

| Venue | Type | Demo mechanics | Why it matters |
|---|---|---|---|
| **Manifold Markets** | Prediction market, play money (mana) | Free API key, 500 req/min, `POST /v0/bet` with limit orders; ToS permits bots | The only venue where the exact live API, real order book, and real settlement can be exercised end to end with no money. First external adapter. |
| **Kalshi demo** | Regulated prediction market | `https://external-api.demo.kalshi.co/trade-api/v2`, mock funds, separate creds, RSA-PSS auth. Nigeria on supported list for the Oct 2025 international launch | Same API shape as production. Second adapter. |
| **Polymarket** | Prediction market | No sandbox. Gamma API (public metadata), CLOB read-only. Simulate fills with `agent-next/polymarket-paper-trader`'s order-book replay (MCP, 26 tools, exact fee formula) | Read-only odds + internal paper fills. Third adapter. Nigeria not restricted |
| **Bybit demo** | Crypto perps/spot | `api-demo.bybit.com`, `/v5/account/demo-apply-money` up to 100k USDT, orders kept 7 days | Real exchange API for the crypto side. Replaces Binance testnet (ISP blocked, NGN delisted) |
| **Deriv** | Forex, synthetic indices, CFDs | WebSocket API, $10k virtual, unlimited resets, no KYC, 24/7 synthetic indices, popular in Nigeria, local payment agents when live | Forex/CFD live-fire venue. OANDA excludes Nigeria; Alpaca unconfirmed |
| **MetaApi.cloud** over an Exness/FXTM MT5 demo | Forex/CFD | REST over MT4/MT5, free prototyping tier | Optional later; Deriv covers the need for free |

## 5. Open-source to borrow from (do not reinvent)

Prediction and betting math:
- `martineastwood/penaltyblog` (MIT): Poisson, Dixon-Coles, bivariate Poisson, Bayesian, Elo/Massey/Colley/Pi ratings, implied-odds and margin removal. Port the Dixon-Coles + implied-probability pieces to TypeScript for phase 1; run the Python original in the worker later.
- `DOsinga/football_predictions`: ELO → xG → Poisson with an 80/20 blend against the market line. The blend idea is the important part.
- `isaacruedabiota/FOOTBALL-PREDICTOR`: stores pre-kickoff predictions to compute an honest hit rate. Same discipline the decision log below enforces.
- `TessaRichardson/SureBetsBot`, `odds-api/arbitrage-betting-scanner-bot`: Kelly sizing and arb scanning with mock mode.

Exchange/venue frameworks:
- `betcode-org/flumine` (MIT): event-driven, backtest + paper + live behind one strategy interface. Copy the interface shape.
- `alsk1992/CloddsBot` (MIT, 589 stars): 10 prediction markets + 7 perp exchanges, dry-run default, ships an MCP. Closest precedent for "unified multi-venue + MCP". Study its venue adapter contract.
- `cejor6/kalshi-mcp-server`: `KALSHI_ALLOW_PROD` / `KALSHI_TRADING_ENABLED` flags with per-order and daily caps. Matches ZOQO's existing enforcement pattern; copy the flag names' spirit.
- `alpacahq/alpaca-mcp-server` (882 stars): 80+ tools, paper by default. Reference for MCP tool naming and pagination.
- `Polymarket/py-sdk` (py-clob-client is archived), `Kalshi/kalshi-starter-code-python`, Manifold API docs.

Algo frameworks (reference, not dependencies): freqtrade (dry-run, FreqAI), NautilusTrader (backtest-to-live parity), Hummingbot (paper mode). Avoid backtrader (abandoned).

## 6. What actually carries signal in football (so the model is not decorative)

- Bookmaker consensus beat every entry in the 2023 Soccer Prediction Challenge by 6.4% RPS. The market is the strongest single prior. A model that ignores the odds loses to the odds.
- Soccer-specific ratings (pi-ratings with CatBoost, RPS 0.1925) beat ELO, which beats raw form.
- Dixon-Coles ≈ Poisson ≈ Weibull on recent Eredivisie data (RPS 0.1914 to 0.1916). Exponential time decay (ξ ≈ 0.001) and a 4-season lookback help.
- Consistently useful engineered features: xG for/against (time-weighted), home advantage, rest days, lineup strength when the lineup is known, injuries to key players.
- Profit requires **decorrelating from the bookmaker** (Hubáček, Šourek, Železný 2019), not maximizing accuracy. Optimize for calibrated edge versus the line.
- **Closing line value (CLV)** is the accepted small-sample proxy for edge. Football-Data.co.uk closing odds via `soccerdata` give a free CLV baseline. Every paper bet must record the odds at decision time and the closing odds.

## 7. Legal note (Nigeria)

Supreme Court, 22 Nov 2024: the National Lottery Act 2005 is unenforceable outside the FCT; gaming is a state matter. The President declined assent to the Central Gaming Bill in 2025. Lagos LSLGA is the de facto lead regulator (SafePlay self-exclusion; illegal-operator register). No Nigerian statute targets betting bots; exposure is contractual (bookmaker T&Cs). Betting exchanges are effectively unavailable to residents. Not legal advice; a real-money launch needs a lawyer.

## 8. Decisions this research locks in

1. Football venue = internal ZOQO paper sportsbook priced from **Bet9ja + Nairabet public JSON and API-Football's `/odds`** (odds-api.io retired 2026-09-13 — see §2), settled from API-Football results. NGN-denominated wallet ledger.
2. External live-fire venues, in adapter order: Manifold (play money, full API), Kalshi demo, Bybit demo, Deriv virtual, Polymarket read + simulated fills.
3. Existing ZOQO terminal and `/trade` stay as internal venues behind the same adapter interface.
4. Model stack phase 1 in TypeScript inside Next (implied probabilities with margin removal, time-decayed Dixon-Coles, ELO, form windows, blend against market). Phase 3 adds a Python worker (`penaltyblog`, `soccerdata`) for xG and ML.
5. Scheduler = Supabase pg_cron + pg_net hitting the existing cron routes. Vercel cron kept as fallback.
6. Every decision logs model probability, market probability, odds taken, closing odds, stake, rationale, and outcome, so CLV, Brier and ROI are computable per strategy per venue.
7. Real money is never touched by code in this program. The human-placed slip is the bridge.

## Sources

- https://www.semrush.com/trending-websites/ng/gambling
- https://nannews.ng/article/sports-betting-in-nigeria-in-2026-market-growth-and-the-new-state-level-rules/
- https://technext24.com/explainer/top-5-sports-betting-platforms-nigeria/
- https://parse.bot/marketplace/2757946b-3e82-4c02-89a2-802caa23029f/sportybet-com-api
- https://github.com/jayteealao/NaijaBet_Api
- https://help.bet9ja.com/general-tcs/
- https://nigerianmatchday.com/sportybet-deposit-guide-nigeria-2026/
- https://www.bettingtop10.ng/betting-payment-methods/
- https://odds-api.io/sportsbooks
- https://odds-api.io/blog/pinnacle-api-shutdown-alternatives
- https://the-odds-api.com/
- https://www.telecomasia.net/ng/sports-betting/reviews/betfair/
- https://www.registration-betting-exchange.com/ng/
- https://cloudbet.github.io/wiki/en/docs/sports/api/
- https://www.gaming.net/lagos-regulator-names-stake-com-on-illegal-gaming-operators-list/
- https://www.api-football.com/pricing
- https://www.thestatsapi.com/blog/football-data-org-free-tier-limits-2026
- https://github.com/probberechts/soccerdata
- https://github.com/statsbomb/open-data
- https://www.sportmonks.com/football-api/free-plan/
- https://github.com/martineastwood/penaltyblog
- https://pena.lt/y/2025/03/10/which-model-should-you-use-to-predict-football-matches/
- https://github.com/DOsinga/football_predictions
- https://github.com/isaacruedabiota/FOOTBALL-PREDICTOR
- https://github.com/TessaRichardson/SureBetsBot
- https://github.com/betcode-org/flumine
- https://github.com/alsk1992/CloddsBot
- https://github.com/cejor6/kalshi-mcp-server
- https://github.com/alpacahq/alpaca-mcp-server
- https://github.com/agent-next/polymarket-paper-trader
- https://github.com/Polymarket/py-clob-client
- https://dev.to/will_c38674673aba82fa4cbe/polymarket-api-guide-2026-clob-gamma-websockets-rate-limits-and-the-ip-gate-51mp
- https://www.datawallet.com/crypto/polymarket-restricted-countries
- https://docs.kalshi.com/getting_started/demo_env
- https://www.pokerscout.com/kalshi-announces-international-service-which-countries-excluded/
- https://docs.manifold.markets/api
- https://bybit-exchange.github.io/docs/v5/demo
- https://breet.io/blog/does-binance-work-in-nigeria
- https://developers.deriv.com/
- https://www.tic.co.tz/deriv/demo-account/
- https://tradersunion.com/brokers/forex/view/oanda/available-countries/
- https://alpaca.markets/support/countries-alpaca-is-available
- https://github.com/metaapi/metaapi-python-sdk
- https://arxiv.org/html/2309.14807
- https://arxiv.org/pdf/2403.07669
- http://ida.felk.cvut.cz/papers/hubacek2019exploiting.html
- https://vsin.com/how-to-bet/the-importance-of-closing-line-value/
- https://allafrica.com/stories/202601080432.html
