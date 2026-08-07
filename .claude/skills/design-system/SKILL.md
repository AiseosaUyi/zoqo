---
name: design-system
description: "ZOQO's own design-system operator — reads, edits, and keeps in sync the token pipeline (src/lib/tokens.ts -> globals.css CSS vars -> /system explorer -> design.md/TYPOGRAPHY.md docs). Use for anything that touches colors, radii, spacing, shadows, type scale, or shared @/components/ui primitives: adding a color, changing a radius, adjusting the type scale, adding a new primitive, or auditing token drift. This is ZOQO-specific and takes precedence over the generic global creative-director/frontend-design skills for token mechanics in this repo."
trigger: /design-system
---

# /design-system

You manage ZOQO's design system: the token pipeline in `src/lib/tokens.ts`, its mirrors, the shared `@/components/ui` primitives, and the docs that describe all of it. Use this skill whenever a task touches colors, radii, spacing, shadows, typography, or a shared UI primitive — not only when the user types `/design-system` explicitly.

For anything outside ZOQO's own token mechanics — general layout/visual-design judgment, art direction — the global `/creative-director` and `/frontend-design` skills still apply. This skill is specifically about keeping ZOQO's *system* (not any one screen) coherent.

## The pipeline (read this before touching anything)

```
src/lib/tokens.ts   →  source of truth (PALETTE, RADII, SPACING, SHADOWS, TYPE_SCALE, SEMANTIC)
       │
       ├─→ src/app/globals.css   →  CSS custom properties (--color-*, --radius-*, --shadow-*, --font-*)
       │      NOT all auto-generated. tokens.ts's paletteToCssVars() covers --color-*/--surface-*
       │      automatically. Radius, shadow, and type values are HAND-mirrored in globals.css — a
       │      token change in tokens.ts does NOT propagate to globals.css on its own. This exact
       │      drift already happened once (--radius-btn stayed at 10px after RADII.btn became
       │      "999px" in tokens.ts, until caught and fixed) — never assume the two files agree,
       │      grep to confirm.
       │
       ├─→ /system  (src/components/system/*)  →  live, editable explorer + component playground.
       │      Fastest way to SEE a token change and to VERIFY a new @/components/ui primitive is
       │      wired up (add it to ComponentsSection's playground list too, see below).
       │
       └─→ TYPOGRAPHY.md, design.md  →  human-readable docs. Update whichever is affected by your
              change in the same pass as the token edit — these drift silently otherwise.
```

## Hard rules already established in this codebase

- **Tokens or token classes only, never raw hex** in component code. Raw hex is legal only inside a token definition in `tokens.ts` itself.
- **All CTAs are fully rounded** (`rounded-full` / `RADII.btn = "999px"`), enforced in `@/components/ui/Button.tsx`'s `SIZES` map. Any hand-rolled button-shaped element (filled/outlined background, one distinct action — submit, copy, claim, create, deposit, sign in/up) should match. Tabs, segmented controls, dropdown menu items, and quick-amount/tactile chips are **not** CTAs — leave those at chip radius (8px). Icon-only circular buttons are `rounded-full` too, but for a different reason (they're circles, not pills) — don't read that as evidence every small button should be pill.
- **Reuse `@/components/ui` before adding a new primitive.** Check the barrel (`src/components/ui/index.ts`) first. If a component hand-reimplements an existing primitive's look (a bespoke "muted track + active pill" toggle instead of `SegmentedControl` was a real instance of this), that's drift to fix, not a pattern to repeat.
- **Icons: lucide-react only.** No emoji, no `<img>`/`<Image>` for inline icons.
- **Fonts: Inter (UI text) + Bebas Neue (numbers only) + Satoshi (`font-display`, wordmark only).** Don't add font families.
- **`TYPOGRAPHY.md`'s `.text-h1`/`.text-body-1`/etc. utility classes exist in `globals.css` but the real product UI does not use them** — every trading/profile/automations/referrals component hardcodes an arbitrary `text-[Npx] font-{weight}` matching the documented scale instead. Don't mass-convert existing components to the classes unless explicitly asked; do make sure any new size you introduce matches a real `TYPE_SCALE` step rather than an invented number.
- Shared header chrome (`TopNav`, `AutomationsHeader`, `ProfileTopNav`, `ReferralsTopNav`) composes from `src/components/trade/HeaderChrome.tsx` + `useDepositCooldown` (`src/lib/useDepositCooldown.ts`) — extend there, don't hand-copy a fifth header. That copy-paste pattern is exactly how the four headers drifted (missing deposit-lock states, missing unread badges, inconsistent active-nav styling) before being consolidated.

## Workflow — changing a token (color, radius, spacing, shadow)

1. Edit `src/lib/tokens.ts`.
2. **Color/surface change:** `paletteToCssVars()` regenerates the `globals.css` mirror automatically — no manual edit needed there.
3. **Radius/spacing/shadow/type change:** manually update the matching hand-written block in `globals.css` (search for the token name, e.g. `--radius-btn`, `--shadow-e2`).
4. Open `/system` and confirm the token/component actually reflects the change — it can live-preview CSS-var overrides too.
5. `grep -rn` the old raw value (or old class) across `src/components` and `src/app` to catch anywhere it was hardcoded instead of referencing the token; fix those to use the token.
6. Update `TYPOGRAPHY.md` (type-scale changes) and/or `design.md` (everything else — colors, radii, spacing, shadows, component conventions) in the same pass. Don't leave the docs to drift.

## Workflow — new or changed `@/components/ui` primitive

1. Build it in `src/components/ui/`, following an existing primitive's prop shape — the `variant`/`color`/`size` pattern from `Button.tsx` is the house style.
2. Export it from `src/components/ui/index.ts`.
3. Add a `*Playground` function to `src/components/system/ComponentsSection.tsx` and list it in that section's render — this is how the team visually regression-checks every primitive. A primitive that isn't in the playground effectively doesn't exist for future audits.
4. Decide its radius deliberately: pill if it's ever used as a CTA, `chip` (8px) if it's a small tactile/tab element, `card` (16px) if it's a container. Don't invent a fourth radius value without updating `RADII` in `tokens.ts` and `design.md` first.
5. Update `design.md`'s Components section with a one-line description.

## Auditing for drift

When asked to audit or clean up the design system:

- `grep -rn "rounded-\[" src/components src/app` outside `@/components/ui` — arbitrary radius values are candidates for token misuse (should this be `rounded-full`, `rounded-[8px]`/chip, or `rounded-[16px]`/card instead of a one-off number?).
- `grep -rn "#[0-9a-fA-F]\{3,6\}" src/components src/app` — raw hex outside `tokens.ts` is always wrong.
- Diff `RADII`/`SHADOWS`/`SPACING` in `tokens.ts` against their hand-mirrored blocks in `globals.css` line by line — this is the exact class of bug that slipped through once already.
- Grep for hand-rolled toggle/tab-track markup (`bg-muted` + per-item active background) that duplicates `SegmentedControl`.
- Check that every header (`TopNav`, `AutomationsHeader`, `ProfileTopNav`, `ReferralsTopNav`) still imports its shared pieces from `HeaderChrome.tsx` rather than a locally redefined copy.
