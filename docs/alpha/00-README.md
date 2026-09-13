# docs/alpha: ZOQO Alpha program

ZOQO Alpha turns ZOQO from a paper-trading app into an experiment rig that trades and bets across many venues with free or demo money, on a schedule and on demand, logs every decision, scores every strategy, re-allocates budget to what works, and is fully controllable from code through the MCP. Written 2026-09-13 from a full read of the repo and a fresh survey of the venue and data landscape.

| File | What it is | Read when |
|---|---|---|
| `01-platform-digest.md` | What the repo really has today, what is thinner than the docs say, infra facts that gate the build | First, always |
| `02-market-landscape.md` | Nigerian bookmakers, odds APIs, football data, demo venues reachable from Nigeria, open-source to borrow, what carries signal, legal note, locked decisions, sources | Before touching any adapter or data job |
| `03-architecture.md` | The engine: interfaces, adapters, features, risk gate, scheduler, learning loop, `/alpha` page, control surfaces | Before writing any Alpha code |
| `04-schema.md` | The migration | Phase 0 |
| `05-mcp-spec.md` | Scopes, tools, resources, prompts | Phase 2 onward |
| `06-football-model.md` | Data pipeline, feature vector, models, evaluation, football strategies, honest expectations | Phase 3 |
| `07-build-plan.md` | Phases 0 to 6 with acceptance checks and standing rules | Drives the whole build |
| `PROMPT-build-alpha.md` | The single prompt to hand Claude Code | To start the build |
| `STATUS.md` | Created by the build in Phase 0: Done / Next / Needs Aise | During and after the build |
| `plans/` | Per-phase plans produced by `/plan-eng-review` and `/plan-design-review` | During the build |

## Three decisions to know before reading further

1. No Nigerian bookmaker has an API. ZOQO runs its own Naira paper sportsbook priced from real Bet9ja and SportyBet odds (odds-api.io, free tier) and settled from real results (API-Football, free tier). Real-money placement stays human, via a generated slip.
2. Real APIs with zero real money: Manifold (play money), Kalshi demo, Bybit demo, Deriv virtual. Polymarket is read-only with simulated fills. Betfair, OANDA, Binance and Alpaca are out for Nigeria.
3. Scheduling moves to Supabase pg_cron because Vercel Hobby runs cron once a day. "Every hour" is a strategy schedule, and the same runner serves the UI's Run now, the MCP, and the clock.

## Human tasks the build cannot do (expect them in STATUS.md)

Get free keys: odds-api.io, API-Football (api-sports.io), Manifold (profile → API key), Kalshi demo (demo.kalshi.co), Bybit demo (testnet/demo account), Deriv (app registration at developers.deriv.com, virtual token). Configure Supabase custom SMTP (auth OTP cap). Confirm the Vercel plan. Enable pg_cron and pg_net in the Supabase dashboard if the migration cannot.
