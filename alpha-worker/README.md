# alpha-worker (Phase 6 — optional, scaffold only)

Python worker for the parts of ZOQO Alpha's football model that are genuinely better served by Python's ecosystem than a TypeScript port: xG-based features and challenger ML models. See `docs/alpha/07-build-plan.md`'s Phase 6 for the full scope and its explicit gate — **only start on this after Phase 3 has 4+ weeks of real logged data**; training or promoting a model against less than that is how a project fools itself with an overfit "edge" that's actually noise.

This directory is a scaffold, not a running worker: no code here talks to Supabase yet. Wiring it up is future work, done only once the Phase 3 gate above is satisfied.

## What it will do (docs/alpha/03-architecture.md §7 Level 5)

1. Read fixtures/odds/results from the same Supabase Postgres the TypeScript app writes to (via `supabase-py`, service-role key — read-only for fixtures/odds, write-only to `alpha_team_ratings` and `alpha_events`).
2. Refit Dixon-Coles weekly with [`penaltyblog`](https://github.com/martineastwood/penaltyblog) (MIT) — the same math `src/lib/alpha/ratings.ts` ports to TypeScript for the always-on path; this worker's job is to go further (xG, pi-ratings) where Python's ecosystem (`soccerdata` for Understat/FBref/ClubElo) is the only realistic source.
3. Train a CatBoost challenger on pi-ratings + xG, calibrated with isotonic regression, evaluated by RPS and CLV against the `blend` model's holdout performance — **never promoted automatically**. A promotion is a proposal (`alpha_events` kind `proposal`, same mechanism Phase 5's parameter search already uses), applied only by a human or an explicit MCP `apply_proposal` call.
4. **Never places an order.** This worker only ever writes ratings and proposals — every money-adjacent write in this whole program stays in `src/lib/alpha/risk.ts` → venue adapter, on the TypeScript side, so there is exactly one execution path regardless of which process computed the model.

## Why a separate worker instead of a TypeScript port

`penaltyblog` and `soccerdata` are Python-only, actively maintained, and reimplementing xG scraping (Understat/FBref) and CatBoost training in TypeScript would be strictly worse than using the real libraries — see `docs/alpha/02-market-landscape.md` §5's "do not reinvent" list. The always-on Phase 1-3 math (ELO, Dixon-Coles, margin removal, Kelly) stays in TypeScript because it needs to run inside the Vercel-hosted app on every ingest tick; this worker runs weekly, out-of-band, on GitHub Actions, and only needs to be reachable, not fast.

## Setup (once someone starts on this for real)

```
cd alpha-worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # penaltyblog, soccerdata, catboost, supabase, scikit-learn
```

Required env vars (GitHub Actions secrets, never committed): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Status

Scaffold only, per `docs/alpha/PROMPT-build-alpha.md`: "Phase 6 (Python worker) is optional; scaffold `alpha-worker/` with a README and the GitHub Actions workflow but do not block on it." No Python code has been written — there's nothing to train against yet (Phase 3's real ingest hasn't accumulated the required 4+ weeks of data in this environment, and the ingest itself is blocked on `odds-api.io`/`API-Football` credentials — see `docs/alpha/STATUS.md`).
