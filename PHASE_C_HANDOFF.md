# ZOQO — full roadmap handoff: what's done, what's left (Phase C through G)

Written 2026-08-24 at the end of a session that finished Phases A, B, D, and E of the
`feat/trading-terminal` roadmap (see `TERMINAL_SPEC.md` for the full architecture, and
`CLAUDE_CODE_HANDOFF.md` for the original priority list this picks up from — both still accurate
as living docs, just stale on "what's done"). This file is written so a **fresh Claude Code
session with zero memory of this work** can pick up anywhere from Phase C to the end of the
roadmap without needing the prior conversation — read this in full, then `git log --oneline -20`
to see the actual commits, then start. Every remaining phase (C, F, G — D and E are done) is
covered below with the same level of concrete detail; none of them are just a one-line stub.

## What's actually done (verified, not assumed — read the commits, not just this doc)

- **Phase A** (terminal QA, position-size caps): done. `MAX_POSITION_PCT`/`MAX_RISK_PCT` in
  `src/lib/terminalStore.tsx` enforce a real cap (10% of cash / 5% risk-at-stop), informed by the
  agiprolabs trading-skills + polymarket-paper-trader skills' actual guidance, not invented.
- **Phase B** (backend): done and **verified live**, not just built. Supabase project is linked
  (`supabase/config.toml`, `supabase/migrations/`), schema is pushed, all 8 `/api/*` routes do
  real reads/writes, `dataStore.remote.ts`/`dataStore.localStorage.ts` are both real, real
  Supabase Auth is wired into `profile.tsx` (replacing the mocked OTP), and `store.tsx`/
  `terminalStore.tsx`/`academy.ts` all sync to Postgres once signed in. **Confirmed working
  end-to-end** by temporarily flipping `NEXT_PUBLIC_BACKEND_ENABLED=1`, signing up through the
  real UI, and querying Postgres directly — real `profiles`/`wallets`/`academy_progress` rows
  with correct data, all 12 expected `/api/*` calls fired (reads on sign-in, migration POST,
  writes from every provider). Flag is back to unset (default/safe) as of the last commit —
  automations.ts is the one provider **not** wired to the backend yet, on purpose (see Phase C
  below, first bullet).
- **Phase D** (drawing tools): done. `lightweight-charts-drawing`'s `DrawingManager` wired into
  `TerminalChart.tsx`, 12 curated tools in `DrawingToolbar.tsx`, per-asset persistence in
  `src/lib/drawings.ts`. Desktop-only (`lg:flex`) — confirmed via Playwright that it broke mobile
  layout before that fix.
- **Phase E** (mobile UX): done. Five-tab bottom nav (`MobileBottomNav.tsx`, mounted in
  `(app)/layout.tsx`, excluded on `/trade`/`/market/*` since `MobileTradeBar` already has its own
  action bar there), swipeable symbol carousel (`MobileAssetCarousel.tsx`), slide-up order ticket
  (`MobileTerminalBar.tsx`) generalized from `MobileTradeBar.tsx`'s pattern.
- **Mock Trade** (Academy's 4th lesson mechanic, deep-links `/learn` → `/terminal` → back):
  built and the full round-trip is verified via Playwright — place a real trade, grade it, land
  back on the graded lesson view.

### Real bugs found and fixed this session (useful precedent for Phase C's own testing)

1. **`window.location.search` lags behind Next.js's router-managed `useSearchParams()`** during a
   client-side, same-route navigation. Both `TerminalShell.tsx` (Mock Trade's `?mockLesson=`) and
   `learn/page.tsx` (`?resumeLesson=`) originally read the query param via a lazy `useState`
   initializer parsing `window.location.search` directly — worked on a true first mount, silently
   found nothing on a second visit to the same route. Fixed by switching to `useSearchParams()`
   exclusively, wrapped in the `Suspense` boundary it requires. **If Phase C's automation UI or
   MCP server ever reads query params for deep-linking, use `useSearchParams()` from the start.**
2. **This Supabase project was configured for 8-digit OTPs**; the app's UI (`AuthModal.tsx`) has
   exactly 6 input boxes. Fixed via the project's Auth config (`mailer_otp_length: 6`), not the UI
   — the UI was clearly built for the conventional 6-digit format. Confirmed via the Management
   API (`GET /v1/projects/{ref}/config/auth`) — worth checking if any future auth-adjacent work
   behaves unexpectedly.
3. The default Supabase mailer is rate-limited to **2 emails/hour** (`rate_limit_email_sent: 2`,
   no custom SMTP configured — `smtp_host: null`). Testing auth flows repeatedly will exhaust
   this fast; use `supabase.auth.admin.generateLink({type: 'magiclink', email})` (service-role
   key) to fetch a real, currently-valid OTP via `data.properties.email_otp` instead of consuming
   real sends, reserving actual `signInWithOtp` UI calls for one pass per test session.

### Testing approach that worked (no browser extension access this session)

Chrome extension (`mcp__claude-in-chrome__*`) never connected. Used **Playwright directly**
instead: a throwaway Node project in the scratchpad dir (`npm install playwright@1.62.1`,
browsers were already cached at `~/Library/Caches/ms-playwright`), scripted against the local dev
server (`npm run dev -- -p 3010`), with `page.screenshot()` calls read back via the `Read` tool
for visual verification. This is a viable fallback pattern if the extension still isn't connected
next time — don't skip real browser verification just because the extension is unavailable.

## Phase C — automation trigger engine + MCP server (spec §7, §8)

This is the next phase. Two halves that depend on each other:

### C1 — automations.ts real data model (do this first)

`src/lib/automations.ts`'s `Automation` type is still CRUD-only cosmetic mock (`rule: string` is
a free-text label, no `maxOrderSize`/`dailyCap`, no structured condition). The backend side is
**already ready for this** — `src/lib/dataStore.ts`'s `AutomationRecord` already extends
`Automation` with `maxOrderSize`/`dailyCap` (required, NOT NULL in `supabase/schema.sql`'s
`automations` table), and `dataStore.remote.ts`/`dataStore.localStorage.ts` both already
implement `listAutomations`/`createAutomation`/`updateAutomation`/`removeAutomation` against that
shape. What's missing is entirely on the **client UI side**:

1. Redesign `Automation`'s shape in `automations.ts` with real structured fields: `symbol`
   (asset id, reuse `src/lib/assets.ts`'s `AssetDef.id`), `conditionType` (price-crosses-above/
   below, %-change-over-window, moving-average-crossover — the three the spec commits to),
   `threshold`, `action` (market order, sized to a fixed $ amount or % of buying power),
   `maxOrderSize`, `dailyCap`. This is a breaking shape change from today's `rule: string` —
   existing mocked automations don't migrate cleanly (same reasoning as the Phase B migration
   route deliberately excluding automations — see its comment in `src/app/api/migrate/route.ts`).
2. Update `src/components/automations/CreateAutomationModal.tsx` to actually collect these fields
   — it currently only has a generic `{ key: "amount", label: "Trade amount", ... }` param per
   template (`src/components/automations/data.ts`), nothing for a real condition or the two cap
   fields. This is real design/UX work, not just a data-model change — reference the polymarket
   `polymarket-paper-trader` skill's `risk-rules.md` (installed at
   `.agents/skills/polymarket-paper-trader/`) for a working example of exposing `max_position_pct`/
   `human_approval_pct`-style caps in a UI, and the MetaTrader skill (`~/.claude/skills/trading/`)
   for real order-condition UI conventions.
3. Wire `automations.ts`'s CRUD through `getDataStore()` (`src/lib/getDataStore.ts`) the same
   additive way `academy.ts`/`terminalStore.tsx` do — overlay-once-on-sign-in + push-on-change,
   gated on `BACKEND_ENABLED`. This is genuinely simpler than the other providers since
   automations are CRUD (not a single blob), matching `dataStore.remote.ts`'s already-correct
   create/update/remove-by-id shape.

### C2 — the trigger evaluator

`src/app/api/cron/evaluate-triggers/route.ts` is currently a stub — it already checks
`CRON_SECRET` (in `.env.example`, blank in `.env.local`, needs a real value generated via
`openssl rand -hex 32` before this goes live) but returns `notImplemented()`. Build the real
logic:

1. Use `createServiceRoleClient()` from `src/lib/supabase/server.ts` (bypasses RLS — this route
   is the one legitimate service-role caller, per that file's own doc comment) to pull every
   enabled row from `automations` joined with `automation_triggers` (evaluator-state table,
   already in the schema — `last_triggered_at`, `spent_today`, `spent_today_reset_at`).
2. For each, check its condition against the latest price. Crypto prices need a source the cron
   job can reach server-side (the client's WS feeds in `useAssetPrice.ts` don't run server-side) —
   likely `/api/crypto/[symbol]` (already exists, used by `useAssetPrice.ts`'s poll fallback) or a
   direct fetch to the same upstream. Gold/forex already poll `/api/quotes/[symbol]`.
3. On a hit, execute through **the same order-placement path** `terminalStore.openPosition`
   uses — no parallel "automation order" logic (explicit ground rule, repeated throughout
   `TERMINAL_SPEC.md`). Since this runs server-side (no React context), that means calling the
   equivalent Postgres write directly via the `dataStore` shape (`putTerminal` after computing the
   new position), not literally invoking a React hook — but the *math* (cost check, position
   creation, cash debit) must mirror `terminalStore.tsx`'s `openPosition` exactly, including its
   `MAX_POSITION_PCT`/`MAX_RISK_PCT` caps, so a human's order and an automation's order can never
   behave differently. Consider extracting `openPosition`'s pure logic (given cash/positions/price
   → next state) into a shared, framework-agnostic function both the hook and this route call,
   rather than reimplementing it.
4. Enforce `maxOrderSize`/`dailyCap` at execution time — reset `spent_today`/
   `spent_today_reset_at` on a rolling 24h window, reject (skip, log, don't throw) any trigger
   that would exceed either.
5. Wire the actual Vercel Cron schedule — this repo has no `vercel.json`/`vercel.ts` yet. Per the
   injected Vercel plugin guidance this session, `vercel.ts` is the current recommended config
   format (not `vercel.json`) — check `node_modules/next/dist/docs/` and current Vercel docs
   before writing it, this session's own instructions flagged Vercel API knowledge as frequently
   stale. Once a second (spec's own "once a minute is plenty at this scale") is the target cadence.

### C3 — the Zoqo MCP server (spec §7)

Not started at all. `@modelcontextprotocol/sdk` isn't installed yet. Exposes, per the spec:
`get_account_summary`, `get_quote(symbol)`, `get_positions()`/`get_open_orders()`/
`get_trade_history()` (read-only), `place_order(...)`, `close_position(id)`,
`modify_order(id, {...})`, `create_automation_trigger(...)`/`list_automation_triggers()`/
`pause_automation_trigger(id)`, `get_academy_progress()`. Auth: per-user API key with `read`/
`trade` scopes — needs its own table (not yet in `supabase/schema.sql`; add one, following the
existing RLS-per-table pattern) and a settings-page UI to generate/revoke keys. Every write tool
must enforce the *same* `maxOrderSize`/`dailyCap` ceiling C2's evaluator does — one enforcement
point in the data layer, not duplicated per caller, is the whole point (spec's explicit reasoning:
"an agent's own restraint isn't a security boundary"). This depends on C1/C2 existing first —
building it against today's cosmetic `automations.ts` would mean immediately reworking it.

### C3 test note

Reference the `agiprolabs/claude-trading-skills` plugin (already installed,
`claude plugin list` confirms `trading-skills@agiprolabs-claude-trading-skills` enabled) for
MCP-adjacent trading-tool conventions if useful, though it's Python-skill-shaped, not a directly
reusable MCP server implementation.

## Phase F — email digests (spec §6, blocked on Phase B — now unblocked)

Not started. Phase B is done, so this is now genuinely buildable — it was only ever blocked on
the backend existing. Lower priority than Phase C per the original roadmap ordering, but nothing
below depends on Phase C, so it can be built in either order.

1. **Provision a transactional email provider.** Resend recommended (spec allows Postgres+SES
   too) — use the `vercel:marketplace` skill flow to provision it, don't hand-roll the SDK
   integration without going through that skill first (this session's own injected guidance was
   explicit: load `vercel:marketplace` *before* recommending or wiring a provider). Worth noting:
   this is the same kind of SMTP problem Phase B's Auth emails have (see the "2 emails/hour"
   default-mailer note above) — a Resend account wired for digests could *also* become the custom
   SMTP provider Supabase Auth uses (Dashboard → Authentication → Emails → SMTP Settings), solving
   both with one provisioning step instead of two.
2. **Content, per spec §6**: a daily digest ("yesterday: 40 XP, 2 lessons, +2.1% on paper. Today's
   goal: finish Risk Management unit 3.") and a weekly "traders to follow" nudge. Source the daily
   numbers from real Postgres data, not anything fabricated — `academy_progress` (xp, streak,
   `completed_lessons` diffed against yesterday) and `trade_history`/`wallets` (`kind='terminal'`
   rows closed in the last 24h, `cash` delta) via `createServiceRoleClient()`
   (`src/lib/supabase/server.ts`). The "traders to follow" nudge is explicitly illustrative per
   the existing `leaderboard/page.tsx` comment ("XP board is new: ... illustrative until Phase 2's
   backend gives every user a real, shared Academy XP total") — now that Phase B is done, this is
   the point where that leaderboard could also stop being seeded/mocked and start reading real
   cross-user data from `leaderboard_pnl` (already a view in `supabase/schema.sql`) plus a real
   academy-XP equivalent view, which would make the "traders to follow" nudge genuinely real too.
3. **Scheduling**: another Vercel Cron route, e.g. `/api/cron/daily-digest`, same `CRON_SECRET`-
   gated pattern as `/api/cron/evaluate-triggers` (see Phase C's C2 above) — loop every user with
   an email on file, compute yesterday's numbers, send. Needs its own schedule entry in whatever
   `vercel.ts`/`vercel.json` Phase C's evaluator also needs (write both cron entries at once if
   building this alongside C2, not as two separate config edits).
4. **Preferences/unsubscribe**: nothing in `supabase/schema.sql` currently tracks whether a user
   wants digest emails. Add a column (e.g. `profiles.digest_opt_in boolean default true`) rather
   than a new table — it's a single per-user toggle, not a domain of its own. A real unsubscribe
   link (not just a Settings toggle) is expected for transactional-adjacent email in general;
   Resend's own docs cover list-unsubscribe headers.
5. **Templates**: no email-rendering library installed yet (React Email is Resend's own
   recommended pairing, worth checking their current docs rather than assuming the API — same
   "training data may be stale" caution this session's Vercel guidance repeated for other Vercel-
   adjacent libraries).

## Phase G — real-money bridge (spec §9 Phase 5 — still explicitly not started, deliberately)

This is the last phase in the roadmap. It is **not a coding task to start from this doc alone** —
it needs a real decision from Aise first, recorded in `TERMINAL_SPEC.md` §9 as: "Zoqo will trade
real money, but personal/family only, and non-custodial (each person connects their own broker/
exchange account with their own API key; Zoqo never holds anyone's funds)." That framing already
answers "does this need a broker-dealer license" (no, as long as it stays personal/family/
non-custodial) but leaves the concrete choices below genuinely open. **Do not write broker-
integration code, or wire any real API credential, before these are resolved** — that's not
caution for its own sake, it's the explicit ground rule this whole roadmap has carried since the
original handoff prompt.

### Open decisions only Aise can make

1. **Broker/exchange per asset class.** Forex + gold: OANDA (spec's own pick — "shares an API
   shape across demo and live," meaning the same integration code can point at either) or the
   MetaTrader bridge (`ariadng/metatrader-mcp-server`'s skill is already installed at
   `~/.claude/skills/trading/` specifically so its tool shapes — order types, lot sizing, spread
   handling — can be referenced when this integration is actually built, without inventing a
   parallel convention). Crypto: an actual licensed exchange, unspecified which — needs picking.
2. **KYC flow** — whose responsibility (the broker's own KYC, since accounts are non-custodial
   and user-owned, vs. anything Zoqo itself needs to collect).
3. **Legal/compliance review** — the original handoff doc specifically flagged checking Nigerian
   rules on retail forex trading and international money movement before flipping this on. That's
   a "check before flipping the switch" item per that doc's own framing, not a "check before
   building the paper-trading groundwork" item — but it does gate the actual go-live, not just the
   first line of integration code.

### What's already in place for when those decisions land (no rework needed)

- `supabase/schema.sql`'s `broker_credentials` table: one row per user per broker/exchange
  connection, `scope` (`read`/`trade`) mirroring the MCP key scoping from Phase C's C3,
  `secret_ref` an opaque pointer into a real secrets manager (Vercel env / Supabase Vault) —
  **never the credential itself in that column**. RLS already applied, same pattern as every
  other table.
- The **paper-to-live gate pattern** to reuse, not invent: the `polymarket-paper-trader` skill
  (installed at `.agents/skills/polymarket-paper-trader/`) gates real execution on **20+ closed
  trades, win rate > 55%, Sharpe ratio > 0.5** — confirmed this session (commit `c531e5e`) to
  match the numbers the original handoff doc cited, not a paraphrase. Zoqo's own gate should
  compute the equivalent off real Postgres data (`trade_history`, `wallets`) once Phase B's
  backend has enough real history to compute a meaningful win rate/Sharpe from — a **client-side-
  only gate is explicitly not a safety boundary** (same reasoning as the `maxOrderSize`/`dailyCap`
  enforcement in Phase C being server-side, not trusted from the caller).
- The order-placement path discipline from Phase C (C2: automation orders go through the same
  path human orders do) extends here — a real-money order should go through the *same* logical
  path as a paper order, differing only in which broker/exchange it's actually routed to at the
  bottom, not a parallel "live order" code path bolted on separately.

### What Phase G actually involves once the decisions above are made

1. Broker/exchange OAuth or API-key connection flow (non-custodial — user's own credentials,
   trade-only scope, no-withdrawal permission where the broker's API supports scoping that).
2. The paper-to-live gate UI (a "you're eligible to connect a real account" state once the stats
   above clear the threshold, gating the connection flow itself).
3. Real order routing — translating a Zoqo order into whatever the chosen broker's API expects
   (OANDA and MetaTrader have different conventions; the MetaTrader skill's tool shapes are the
   reference for whichever is picked once picked).
4. Server-enforced spend caps on real orders — the same `maxOrderSize`/`dailyCap` mechanism from
   Phase C, now guarding actual money, not paper cash.

## Practical notes for whoever picks this up

- `NEXT_PUBLIC_BACKEND_ENABLED` is unset (backend-disabled default) in `.env.local` as of the
  last commit. Flip to `1` and restart the dev server (`rm -rf .next` first if Turbopack acts up
  after an env change — happened twice this session) to test against the live backend.
- `.env.local` has real Supabase URL/anon/service-role keys already — gitignored, never committed,
  don't paste them into commits or chat transcripts that might get persisted elsewhere.
- `SUPABASE_ACCESS_TOKEN` (a personal access token, different from the anon/service-role keys) is
  needed for any `supabase` CLI command that talks to the Management API (`link`, `db push`,
  `gen types`, etc.) — not stored anywhere in this repo; whoever continues this needs their own or
  the one used this session (not persisted here on purpose).
- `npm run build` and `npm run lint` were clean at the end of every commit this session — keep
  that bar. No test framework in this repo; browser verification (Playwright or the Chrome
  extension) is the standard here per `CLAUDE.md`.
