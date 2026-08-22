# ZOQO Design System

This is the human-readable reference for ZOQO's design system — colors, spacing, radii, shadows, and component conventions. It exists alongside two other sources, each with a distinct job:

- **`src/lib/tokens.ts`** — the *canonical* source. Every value here traces back to it.
- **`TYPOGRAPHY.md`** — the deep reference for the type scale specifically (every size, weight, use case).
- **`/system`** — the live, editable explorer. Fastest way to *see* a token and preview a change before committing to it.

This file is the map between them, plus the conventions that live in component code rather than in `tokens.ts` itself (e.g. "CTAs are pill-shaped" is a rule enforced in `Button.tsx`, not a token value).

## The pipeline

```
src/lib/tokens.ts   →  source of truth (PALETTE, RADII, SPACING, SHADOWS, TYPE_SCALE, SEMANTIC)
       │
       ├─→ src/app/globals.css   →  CSS custom properties (--color-*, --radius-*, --shadow-*, --font-*)
       │      Colors/surfaces are auto-mirrored by tokens.ts's paletteToCssVars(). Radius, shadow,
       │      and type values are HAND-mirrored — editing tokens.ts does not update globals.css by
       │      itself. (This exact drift happened once already with --radius-btn — don't assume the
       │      two files agree; check.)
       │
       └─→ /system  (src/components/system/*)  →  live explorer + component playground, can preview
              CSS-var overrides at runtime and export the palette back out as TS or CSS.
```

## Color

Ten-step ramps (50 lightest → 900 darkest), `base: "500"` marks the canonical brand step for each ramp. Defined in `PALETTE` in `tokens.ts`:

| Ramp | Role |
|---|---|
| `gray` | Text, borders, neutral UI — single warm-neutral family tuned to the app's warm surfaces |
| `purple` | Primary brand — CTAs, the live price line, focus states |
| `blue` | Information, volume bars, secondary data series |
| `green` | Up / Yes, profit, confirmations |
| `red` | Down / No, loss, destructive, errors |
| `orange` | Secondary accent, rewards, highlights |
| `yellow` | Energy, target lines, attention without alarm |
| `gold` | Warnings, countdowns, pending states |
| `brown` | Earthy neutral accent |

Semantic aliases (`SEMANTIC` in `tokens.ts`) map roles onto ramp steps: `text-primary`, `text-sub`, `brand`, `up`/`up-weak`, `down`/`down-weak`, `volume`, `target`, `warning`. Surfaces (`SURFACES`) are a separate warm-neutral set for backgrounds: `page` (#F5F5F5), `surface` (#FFFFFF, card bg), `muted` (#F4F2EE, tab tracks/chips), `line`/`lineStrong` (hairline borders).

**Rule:** component code uses Tailwind token classes (`bg-purple-500`, `text-green-500`, `border-line`) or `var(--color-*)`. Raw hex only ever appears inside `tokens.ts` itself.

## Radii

| Token | Value | Use |
|---|---|---|
| `none` | 0px | — |
| `chip` | 8px | Small tactile elements: quick-amount buttons, tags, dropdown menu items, tabs |
| `btn` | 999px (pill) | **Every CTA.** Any filled/outlined element that's a single distinct action. |
| `card` | 16px | Cards, modals, larger containers |
| `pill` | 999px | Same value as `btn`, used directly for badges/status pills |

The pill-CTA rule is a deliberate, whole-app convention (enforced in `@/components/ui/Button.tsx`'s `SIZES` map) — don't reintroduce a boxy button. It does *not* apply to tabs/segmented controls/dropdown items/quick-amount chips, which stay at chip radius, or to icon-only circular buttons, which are `rounded-full` for a different reason (they're circles, not pills).

## Spacing

4px base unit: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48` (`SPACING` in `tokens.ts`). There's no spacing utility-class layer — components use arbitrary Tailwind values (`px-3`, `py-2.5`, `gap-2`) that land on these steps.

## Shadows / elevation

`e1`…`e5` is a rising elevation scale — each step stacks a tight contact shadow with a wider ambient one, tinted with the warm ink color at low alpha. `brand`/`up`/`down` are colored glows for CTAs and directional states. Defined in `SHADOWS` in `tokens.ts`, exposed as `shadow-e1`…`shadow-e5` Tailwind utilities via `globals.css`.

## Typography

Two fonts, no exceptions: **Inter** for all UI text (headings, body, labels, buttons, forms) and **Bebas Neue** exclusively for numbers (prices, balances, percentages, counts). Full scale, sizes, weights, and per-size use-case guidance live in `TYPOGRAPHY.md` — read that before picking a size for new UI text.

One gap between docs and code worth knowing: `TYPOGRAPHY.md` documents utility classes (`.text-h1`, `.text-body-1`, `.text-num-3`, etc.) that exist in `globals.css` and are used in `/system`'s own copy-paste code samples — but the actual trading/profile/automations/referrals UI does not use them. Real components hardcode `text-[Npx] font-{weight}` matching a `TYPE_SCALE` step directly. When adding new UI, match an existing scale step rather than inventing a size; don't mass-convert existing components to the utility classes unless specifically asked to.

## Components

- **`@/components/ui`** barrel: `Button`, `Card`, `Badge`, `Tag`, `SegmentedControl`, `Select`, `Input`, `Textarea`, `Checkbox`, `Radio`, `Switch`, `Tabs`, `Accordion`, `Avatar`, `Alert`, `Progress`, `Skeleton`, `Spinner`, `Stat`, `Tooltip`, `EmptyState`, `Slider`. Reuse one of these — or extend it — before hand-rolling a look-alike. `ChartToolbar`'s timeframe toggle and `DepositModal`'s coin picker used to be bespoke reimplementations of `SegmentedControl`; both were converted to the real component, which is the standard to hold new code to.
- **`EmptyState`** — icon-in-circle + title + description + up to two `Button` actions, dashed-border container. The real "you have nothing here yet" affordance (e.g. zero Automations) — write copy with actual personality, never "No items found."
- **`Slider`** — native `<input type="range">` styled with the `accent-*` utility (real keyboard/screen-reader support, not a div-based reimplementation). Used by Academy's "Build the Order" lesson mechanic for entry/stop-loss/take-profit.
- **`Button`** — `variant` (`solid`/`soft`/`outline`/`ghost`) × `color` (`brand`/`up`/`down`/`gray`/`orange`/`blue`/`gold`) × `size` (`xs`–`xl`), all pill-radius.
- **Icons:** lucide-react exclusively, no emoji, no raster icons.
- **Class merging:** `cn()` (`src/lib/cn.ts`, `clsx` + `tailwind-merge`).
- **Shared header chrome:** `src/components/trade/HeaderChrome.tsx` + `useDepositCooldown` — the logo, nav, stats, deposit button, bell, and auth-button pieces every page header composes from. See `CLAUDE.md` for why this exists.
- **Motion:** CSS keyframes defined in `globals.css`, respecting `prefers-reduced-motion`. No animation library.

## Keeping this in sync

When a change touches any token or shared component:

1. Edit `src/lib/tokens.ts` first — it's canonical.
2. Color/surface changes propagate automatically via `paletteToCssVars()`. Radius/shadow/type changes need a matching hand-edit in `globals.css`.
3. Check `/system` — confirm the token or component actually reflects the change.
4. `grep -rn` for the old raw value across `src/components` — catch anywhere it was hardcoded instead of referencing the token, and fix those too.
5. Update this file and/or `TYPOGRAPHY.md` in the same change if the convention or scale shifted.

The `/design-system` skill (`.claude/skills/design-system/`) walks through this end-to-end, including the workflow for adding a brand-new `@/components/ui` primitive.

## Reference material

`.figma/` holds raw Figma API export dumps (`ds-a.json`, `ds-b.json`, `ds-colors.json`, `multi.json`, `single.json`, `extra.json`, plus rendered PNGs) that the system was originally translated from. They're large — treat them as historical reference, not something to read in full, and never as more current than `tokens.ts`.
