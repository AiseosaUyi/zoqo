# ZOQO Typography System

**Version:** 1.0 | **Status:** Live & Responsive | **Last Updated:** June 2026

## Core Principles

1. **One UI Font:** Inter handles all interface text (headings, body, labels, captions, buttons, forms)
2. **One Data Font:** Bebas Neue is **exclusive** to numeric data (prices, amounts, percentages, balances, counts)
3. **Clear Scale:** 80px hero → 10px caption. Every size has a named purpose.
4. **Responsive:** All type sizes scale proportionally for mobile/tablet/desktop
5. **Developer-First:** Use CSS utility classes—no custom styling needed

---

## Type Scale Overview

### Hero Display (80–56px) — Landing Pages

Use for landing page hero headlines and major page titles.

| Class | Size | Weight | Use Case |
|-------|------|--------|----------|
| `.text-hero-xl` | 80px | 700 | Largest hero headline, eye-catching title |
| `.text-hero-lg` | 64px | 700 | Landing section headline, page title |
| `.text-hero` | 56px | 600 | Hero section, major heading |

**Example:**
```html
<h1 class="text-hero-xl">Predict Bitcoin</h1>
<h2 class="text-hero-lg">Real-time Trading</h2>
```

---

### Headings (48–18px) — UI Section Headers

Use for main section titles, subsections, and card headings throughout the product.

| Class | Size | Weight | Use Case |
|-------|------|--------|----------|
| `.text-h1` | 48px | 600 | Main page section (e.g., "Order Book") |
| `.text-h2` | 40px | 600 | Secondary section heading |
| `.text-h3` | 32px | 600 | Tertiary heading, card title |
| `.text-h4` | 24px | 600 | Minor heading, modal titles |
| `.text-h5` | 20px | 600 | Small heading, form section label |
| `.text-h6` | 18px | 600 | Smallest heading, table header |

**Example:**
```html
<h1 class="text-h1">Portfolio Summary</h1>
<h2 class="text-h2">Market Details</h2>
<h3 class="text-h3">Trade History</h3>
```

---

### Body Text (16–14px) — Content & Descriptions

Use for paragraphs, explanations, form descriptions, and primary content.

| Class | Size | Weight | Line Height | Use Case |
|-------|------|--------|-------------|----------|
| `.text-body-1` | 16px | 400 | 1.5 | Primary body text, main reading size |
| `.text-body-1-strong` | 16px | 600 | 1.5 | Emphasized body text (16px, 600wt) |
| `.text-body-2` | 15px | 400 | 1.5 | Secondary body text, slightly compact |
| `.text-body-2-strong` | 15px | 600 | 1.5 | Emphasized secondary text (15px, 600wt) |
| `.text-body-3` | 14px | 400 | 1.5 | Tertiary body, form hints, default UI size |
| `.text-body-3-strong` | 14px | 600 | 1.5 | Emphasized tertiary text (14px, 600wt) |

**Example:**
```html
<p class="text-body-1">You will receive 112.36 YES shares when this trade settles.</p>
<p class="text-body-3">This order may be partially filled.</p>
<span class="text-body-3-strong">Profit: +$234.50</span>
```

---

### Labels & Captions (12–10px) — Small Text

Use for form labels, field names, tooltips, timestamps, metadata, and small UI labels.

| Class | Size | Weight | Use Case |
|-------|------|--------|----------|
| `.text-label` | 12px | 500 | Form labels, field names, table headers, tags, tooltips |
| `.text-label-strong` | 12px | 600 | Emphasized label, badge text (12px, 600wt) |
| `.text-caption` | 11px | 400 | Timestamp, footnotes, small metadata |
| `.text-caption-strong` | 11px | 600 | Emphasized caption, small alerts (11px, 600wt) |
| `.text-caption-xs` | 10px | 500 | Microscopic label, breadcrumb text |

**Example:**
```html
<label for="price" class="text-label">Entry Price</label>
<span class="text-caption">Last updated 3s ago</span>
<span class="text-caption-xs">LIVE • 3s ago</span>
```

---

## Numeric Data — Bebas Neue ONLY

**CRITICAL RULE:** Use Bebas Neue **only** for numbers. Never use it for prose.

### Numeric Type Scales

| Class | Size | Weight | Use Case |
|-------|------|--------|----------|
| `.text-num-display-xl` | 72px | 400 | Hero price, main stat (landing page) |
| `.text-num-display-lg` | 56px | 400 | Large price value, portfolio total |
| `.text-num-display` | 48px | 400 | Price, balance, significant amount |
| `.text-num-heading` | 32px | 400 | Card value, metric number, position amount |
| `.text-num-body` | 18px | 400 | Inline numeric value, share count, percentage |
| `.text-num-label` | 14px | 400 | Small numeric value, table cell, list amount |

**Example:**
```html
<!-- Hero price (landing) -->
<div class="text-num-display-xl">$67,500</div>

<!-- Card value -->
<div class="text-num-heading">+$234.50</div>

<!-- Inline number -->
<span class="text-num-body">112.36</span>

<!-- Small amount -->
<span class="text-num-label">$61.24</span>
```

### Tabular Numbers

All numeric classes include `font-variant-numeric: tabular-nums` by default—numbers align vertically in tables without extra styling.

---

## Component Usage Patterns

### Heading with Subtitle

```html
<div>
  <h1 class="text-h1">Portfolio</h1>
  <p class="text-body-2 text-sub">Your current positions and balances</p>
</div>
```

### Card with Title & Data

```html
<div class="rounded-lg border p-4">
  <h3 class="text-h5">Current Balance</h3>
  <div class="text-num-display mt-4">$12,345.67</div>
  <p class="text-caption text-sub mt-2">Updated just now</p>
</div>
```

### Form Section

```html
<fieldset>
  <legend class="text-h5">Trade Details</legend>
  <label class="text-label">Amount</label>
  <input type="text" />
  <p class="text-body-3 text-sub">Enter the amount to trade</p>
</fieldset>
```

### List Item with Value

```html
<div class="flex justify-between">
  <span class="text-body-3">Total Invested</span>
  <span class="text-body-3-strong text-num-body">$45,230.89</span>
</div>
```

---

## Responsive Behavior

All type utilities maintain their defined sizes across viewports. For dynamic scaling on specific components, use CSS media queries or Tailwind `sm:`, `lg:`, etc. prefixes:

```html
<!-- Default: h4 (24px), scales to h3 (32px) on large screens -->
<h2 class="text-h4 lg:text-h3">Responsive Title</h2>
```

---

## CSS Variable Access

All type scales are exposed as CSS custom properties for advanced use cases:

```css
/* If you need to build custom typography outside the utility set */
.custom-type {
  font-family: var(--font-inter);  /* or var(--font-bebas) */
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
}
```

---

## Handoff for Developers

### Quick Start

1. **Use class names.** Every type scale has a corresponding `.text-{key}` utility.
2. **Inter for text. Bebas for numbers.** That's the rule.
3. **No custom CSS.** The system covers all cases.
4. **Check `/system`** if you forget a size or use case.

### Common Questions

**Q: Can I use Satoshi?**  
A: No. Satoshi has been removed from the system. Use Inter for all headings.

**Q: Can I use Bebas Neue for text?**  
A: No. Bebas Neue is **exclusively** for numeric data. Never use it for prose, sentences, or labels.

**Q: What if I need a size that's not listed?**  
A: The system covers 10px–80px with intentional steps. If you need an in-between size, it's likely better served by one of the existing scales. Ask the design team before adding custom sizes.

**Q: How do I make a number display as tabular?**  
A: All `.text-num-*` classes include tabular numerals by default. No extra styling needed.

**Q: Can I combine classes (e.g., `.text-h1 .text-body-1`)?**  
A: No. Each element gets exactly one type class. If you need mixed styles, use separate elements.

### File References

- **System definition:** `/src/lib/tokens.ts` (TypeScript export)
- **CSS utilities:** `/src/app/globals.css`
- **Live reference:** `/system` (design system explorer)
- **This guide:** `/TYPOGRAPHY.md`

---

## Design System Explorer

Visit `/system` → **Typography** to see:

- Live type scales with samples
- Font family details and CSS variable references
- Grouped by purpose (hero, headings, body, labels, numeric)
- Copy-paste code snippets for common patterns

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jun 2026 | Initial release. Removed Satoshi. Clarified Inter/Bebas-only rule. Added use cases for every scale. |

---

## Questions?

Check the design system explorer at `/system` or review `/src/lib/tokens.ts` for the source of truth.
