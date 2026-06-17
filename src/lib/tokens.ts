/**
 * ZOQO Design Tokens — single source of truth.
 *
 * Color scales are 10-step ramps (50 = lightest … 900 = darkest), Mantine /
 * Tailwind style. Values 50–900 were extracted from the ZOQO Figma "Foundations
 * / Colors" page; `brown` is a ZOQO addition. Both the product UI and the
 * `/system` design-system explorer read from this file. The explorer can also
 * live-edit these values (writing CSS variables) and export them back out, so
 * the system is reusable in any project.
 */

export type Shade =
  | "50" | "100" | "200" | "300" | "400"
  | "500" | "600" | "700" | "800" | "900";

export const SHADES: Shade[] = [
  "50", "100", "200", "300", "400", "500", "600", "700", "800", "900",
];

export type ColorScale = Record<Shade, string>;

const scale = (...hex: string[]): ColorScale =>
  SHADES.reduce((acc, s, i) => {
    acc[s] = hex[i];
    return acc;
  }, {} as ColorScale);

export interface ColorMeta {
  key: string;
  label: string;
  role: string; // what it's for in the product
  base: Shade; // the "500"-equivalent brand step
  scale: ColorScale;
}

/** The full ZOQO palette. `base` marks the canonical mid step for each ramp. */
export const PALETTE: ColorMeta[] = [
  {
    key: "gray",
    label: "Gray",
    role: "Text, borders, and neutral UI — ONE warm-neutral family (consistent R≥G≥B undertone at every step), tuned to sit on the dashboard's warm surfaces (#F5F5F5 / #F4F2EE).",
    base: "500",
    // Single coherent warm-neutral ramp: every step keeps the same warm cast
    // and the lightness curve is perceptually even. 100 stays #F4F2EE (the
    // established muted surface); 500 (#78746B) is the AA-legible sub-text;
    // 900 (#16140F) is a warm near-black ink.
    scale: scale(
      "#FAF9F7", "#F4F2EE", "#E8E6E0", "#D6D3CB", "#B0ABA1",
      "#78746B", "#5C584F", "#423F38", "#2A2823", "#16140F",
    ),
  },
  {
    key: "purple",
    label: "Purple — Primary",
    role: "Primary brand. CTAs, the live price line, focus states.",
    base: "500",
    scale: scale(
      "#EFE9FF", "#DFD2FF", "#BFA5FF", "#A079FF", "#804CFF",
      "#601FFF", "#561CE6", "#4316B3", "#301080", "#130633",
    ),
  },
  {
    key: "blue",
    label: "Blue",
    role: "Information, volume bars, secondary data series.",
    base: "500",
    scale: scale(
      "#E6EDFF", "#CCDAFF", "#99B5FF", "#6691FF", "#336CFF",
      "#0047FF", "#0039CC", "#002B99", "#001C66", "#000E33",
    ),
  },
  {
    key: "green",
    label: "Green — Success",
    role: "Up / Yes, profit, confirmations.",
    base: "500",
    scale: scale(
      "#E9F7EF", "#D4EFDF", "#A9DFBF", "#7DCEA0", "#52BE80",
      "#27AE60", "#1F8B4D", "#17683A", "#104626", "#082313",
    ),
  },
  {
    key: "red",
    label: "Red — Error",
    role: "Down / No, loss, destructive, errors.",
    base: "500",
    scale: scale(
      "#FFEAE6", "#FFD5CC", "#FFAB99", "#FF8266", "#FF5833",
      "#FF2E00", "#CC2500", "#991C00", "#661200", "#330900",
    ),
  },
  {
    key: "orange",
    label: "Orange — Secondary",
    role: "Secondary accent, rewards, highlights.",
    base: "500",
    scale: scale(
      "#FFF1E6", "#FFE3CC", "#FFC799", "#FFAB66", "#FF8F33",
      "#FF7300", "#E66800", "#B35100", "#803A00", "#331700",
    ),
  },
  {
    key: "yellow",
    label: "Yellow",
    role: "Energy, target lines, attention without alarm.",
    base: "500",
    scale: scale(
      "#FFFBE6", "#FFF7CC", "#FFEF99", "#FFE866", "#FFE033",
      "#FFD800", "#CCAD00", "#998200", "#665600", "#332B00",
    ),
  },
  {
    key: "gold",
    label: "Gold — Warning",
    role: "Warnings, countdowns, pending states.",
    base: "500",
    scale: scale(
      "#FFF7E8", "#FFE7B9", "#FFD78A", "#FEC65B", "#FEB62C",
      "#FEAE14", "#CB8B10", "#98680C", "#664608", "#332304",
    ),
  },
  {
    key: "brown",
    label: "Brown",
    role: "Earthy neutral accent — added to the ZOQO system.",
    base: "500",
    scale: scale(
      "#F7F0EA", "#ECDBCB", "#DBBE9E", "#C79D71", "#B07E4A",
      "#8F5E2E", "#744B25", "#58381C", "#3B2613", "#1F1409",
    ),
  },
];

export const PALETTE_BY_KEY: Record<string, ColorMeta> = Object.fromEntries(
  PALETTE.map((c) => [c.key, c]),
);

/** Warm-neutral surfaces (distinct from the cool gray text ramp). */
export const SURFACES = {
  page: "#F5F5F5",
  surface: "#FFFFFF",
  muted: "#F4F2EE", // tab tracks, chips — gray-100
  line: "#E8E6E0", // hairline borders — gray-200
  lineStrong: "#D6D3CB", // gray-300
  black: "#16140F",
  white: "#FFFFFF",
};

/** Semantic aliases mapped onto the scales — what the product actually calls. */
export const SEMANTIC = {
  "text-primary": "var(--color-gray-900)",
  "text-sub": "var(--color-gray-500)",
  "text-onbrand": "#FFFFFF",
  brand: "var(--color-purple-500)",
  "brand-weak": "var(--color-purple-50)",
  up: "var(--color-green-500)",
  "up-weak": "var(--color-green-100)",
  down: "var(--color-red-500)",
  "down-weak": "var(--color-red-100)",
  volume: "var(--color-blue-100)",
  target: "var(--color-yellow-500)",
  warning: "var(--color-gold-500)",
};

export const RADII = {
  none: "0px",
  chip: "8px",
  btn: "10px",
  card: "16px",
  pill: "999px",
};

export const SPACING = {
  "0": "0px", "1": "4px", "2": "8px", "3": "12px", "4": "16px",
  "5": "20px", "6": "24px", "8": "32px", "10": "40px", "12": "48px",
};

/**
 * Layered elevation scale. World-class systems stack two soft shadows — a tight
 * contact shadow plus a wider ambient one — tinted with the warm ink (#16140f →
 * rgba(22,20,15,…)) at low alpha. e1…e5 rise in elevation; brand/up/down are
 * colored glows for CTAs and directional states. Mirrors the `--shadow-*`
 * custom properties in globals.css, which Tailwind v4 turns into `shadow-e2`
 * etc. utilities.
 */
export const SHADOWS = {
  e1: "0 1px 1px rgba(22,20,15,0.04), 0 1px 2px rgba(22,20,15,0.06)",
  e2: "0 1px 2px rgba(22,20,15,0.06), 0 4px 12px rgba(22,20,15,0.06)",
  e3: "0 2px 4px rgba(22,20,15,0.06), 0 8px 20px rgba(22,20,15,0.08)",
  e4: "0 4px 8px rgba(22,20,15,0.07), 0 16px 32px rgba(22,20,15,0.10)",
  e5: "0 8px 16px rgba(22,20,15,0.08), 0 28px 56px rgba(22,20,15,0.14)",
  brand: "0 6px 20px rgba(96,31,255,0.28), 0 2px 6px rgba(96,31,255,0.18)",
  up: "0 6px 20px rgba(39,174,96,0.26), 0 2px 6px rgba(39,174,96,0.16)",
  down: "0 6px 20px rgba(255,46,0,0.24), 0 2px 6px rgba(255,46,0,0.16)",
};

export interface TypeToken {
  key: string;
  label: string;
  font: "Inter" | "Bebas Neue";
  size: number;
  weight: number;
  lineHeight: number;
  tracking?: string;
  sample: string;
  useCase: string; // Clear developer guidance
}

/**
 * ZOQO Typography Scale — two fonts, clear rules.
 *
 * Inter   → all UI text: headings, body, labels, captions, buttons, forms.
 * Bebas Neue → numbers only: prices, amounts, balances, percentages, counts.
 */
export const TYPE_SCALE: TypeToken[] = [
  /* ---- HEADINGS — Inter, H1→H6 ---- */
  { key: "h1", label: "H1", font: "Inter", size: 80, weight: 700, lineHeight: 1.0, tracking: "-0.02em", sample: "Predict Bitcoin", useCase: "Largest heading. Landing page hero, top-level page title." },
  { key: "h2", label: "H2", font: "Inter", size: 64, weight: 700, lineHeight: 1.05, tracking: "-0.015em", sample: "Trade the Move", useCase: "Major landing section title, top-of-page feature heading." },
  { key: "h3", label: "H3", font: "Inter", size: 48, weight: 600, lineHeight: 1.1, tracking: "-0.01em", sample: "Portfolio Summary", useCase: "Section heading, dashboard page title." },
  { key: "h4", label: "H4", font: "Inter", size: 32, weight: 600, lineHeight: 1.2, sample: "Market Details", useCase: "Subsection title, card heading, modal title." },
  { key: "h5", label: "H5", font: "Inter", size: 24, weight: 600, lineHeight: 1.3, sample: "Order Book", useCase: "Minor heading, panel title. Common in dashboard UI." },
  { key: "h6", label: "H6", font: "Inter", size: 21, weight: 600, lineHeight: 1.35, sample: "Live Trades", useCase: "Smallest heading, table section label, sidebar group title." },

  /* ---- BODY — Inter ---- */
  { key: "body-1", label: "Body 1", font: "Inter", size: 16, weight: 400, lineHeight: 1.5, sample: "You will receive 112 YES shares when this trade settles.", useCase: "Primary reading text. Descriptions, confirmations, tooltips." },
  { key: "body-2", label: "Body 2", font: "Inter", size: 14, weight: 400, lineHeight: 1.5, sample: "This order may be partially filled at market price.", useCase: "Secondary body text. Default for most dashboard UI text." },
  { key: "body-3", label: "Body 3", font: "Inter", size: 12, weight: 400, lineHeight: 1.5, sample: "Settled markets lock in final price at expiry.", useCase: "Small body text. Compact info rows, sidebar text." },

  /* ---- LABELS & CAPTIONS — Inter ---- */
  { key: "label", label: "Label", font: "Inter", size: 12, weight: 500, lineHeight: 1.4, sample: "Entry Price", useCase: "Form labels, field names, table headers, tags, tooltips." },
  { key: "caption", label: "Caption", font: "Inter", size: 11, weight: 400, lineHeight: 1.35, tracking: "0.01em", sample: "Updated 3s ago", useCase: "Timestamps, metadata, footnotes, secondary info." },
  { key: "caption-xs", label: "Caption XS", font: "Inter", size: 10, weight: 500, lineHeight: 1.3, tracking: "0.02em", sample: "LIVE • 3s ago", useCase: "Microscopic label. Status chips, breadcrumbs, live indicators." },

  /* ---- NUMBERS — Bebas Neue ONLY ---- */
  { key: "num-1", label: "Num 1", font: "Bebas Neue", size: 48, weight: 400, lineHeight: 0.95, tracking: "0.01em", sample: "$67,500.00", useCase: "Hero price, main balance, biggest stat. Use for primary data point per card." },
  { key: "num-2", label: "Num 2", font: "Bebas Neue", size: 32, weight: 400, lineHeight: 1.0, tracking: "0.005em", sample: "$12,345.67", useCase: "Section amount, portfolio value, card metric." },
  { key: "num-3", label: "Num 3", font: "Bebas Neue", size: 24, weight: 400, lineHeight: 1.1, tracking: "0.005em", sample: "+$234.50", useCase: "Inline amount, P&L value, order price." },
  { key: "num-4", label: "Num 4", font: "Bebas Neue", size: 18, weight: 400, lineHeight: 1.3, tracking: "0.005em", sample: "112.36", useCase: "Share count, percentage, compact amount." },
  { key: "num-5", label: "Num 5", font: "Bebas Neue", size: 14, weight: 400, lineHeight: 1.4, tracking: "0.01em", sample: "$61.24", useCase: "Table cell value, small list amount, ticker price." },
];

export const FONTS = [
  { key: "inter", label: "Inter", role: "All UI text — headings, body, labels, captions, buttons, forms. The only UI font.", cssVar: "var(--font-inter)" },
  { key: "bebas", label: "Bebas Neue", role: "Numbers only — prices, amounts, balances, percentages, counts. Never use for prose.", cssVar: "var(--font-bebas)" },
];

/** Emit the palette + surfaces as CSS custom properties (used at build + by export). */
export function paletteToCssVars(palette: ColorMeta[] = PALETTE): string {
  const lines: string[] = [];
  for (const c of palette) {
    for (const s of SHADES) lines.push(`  --color-${c.key}-${s}: ${c.scale[s]};`);
  }
  for (const [k, v] of Object.entries(SURFACES)) {
    lines.push(`  --surface-${k}: ${v};`);
  }
  return lines.join("\n");
}

/** Export the palette as a portable TS snippet (for the explorer's "copy" action). */
export function paletteToTs(palette: ColorMeta[] = PALETTE): string {
  const body = palette
    .map(
      (c) =>
        `  ${c.key}: [${SHADES.map((s) => `"${c.scale[s]}"`).join(", ")}],`,
    )
    .join("\n");
  return `export const colors = {\n${body}\n};\n`;
}
