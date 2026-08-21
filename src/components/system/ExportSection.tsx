"use client";
import * as React from "react";
import { PALETTE, SHADES, SURFACES, paletteToTs, type ColorMeta } from "@/lib/tokens";
import { CodeBlock, Section } from "./primitives";
import { SegmentedControl } from "@/components/ui";
import { useHasMounted } from "@/lib/useLocalStorageState";

/** Read the currently-applied value of a color token (reflecting live edits). */
function liveHex(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${token}`)
    .trim();
  return v || fallback;
}

/** Build a palette reflecting the current (possibly edited) computed values. */
function currentPalette(): ColorMeta[] {
  return PALETTE.map((c) => ({
    ...c,
    scale: SHADES.reduce((acc, s) => {
      acc[s] = liveHex(`${c.key}-${s}`, c.scale[s]);
      return acc;
    }, {} as ColorMeta["scale"]),
  }));
}

function buildCss(palette: ColorMeta[]): string {
  const lines: string[] = [":root {"];
  for (const c of palette) {
    for (const s of SHADES) lines.push(`  --color-${c.key}-${s}: ${c.scale[s]};`);
  }
  for (const [k, v] of Object.entries(SURFACES)) lines.push(`  --surface-${k}: ${v};`);
  lines.push("}");
  return lines.join("\n");
}

function buildJson(palette: ColorMeta[]): string {
  const obj: Record<string, Record<string, string>> = {};
  for (const c of palette) {
    obj[c.key] = SHADES.reduce((acc, s) => {
      acc[s] = c.scale[s];
      return acc;
    }, {} as Record<string, string>);
  }
  return JSON.stringify({ colors: obj, surfaces: SURFACES }, null, 2);
}

type Format = "CSS" | "TS" | "JSON";

export function ExportSection() {
  const [format, setFormat] = React.useState<Format>("CSS");
  // `tick` is a manual invalidation signal for currentPalette()'s untracked
  // DOM read — bumped by the format switch and the "Refresh" button below.
  // `mounted` (useHasMounted) covers the mount-time re-read that used to be
  // a setState-in-effect: it flips from false to true exactly once after
  // hydration via useSyncExternalStore, which is enough to invalidate this
  // memo without a manual effect.
  const [tick, setTick] = React.useState(0);
  const mounted = useHasMounted();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = React.useMemo(() => currentPalette(), [tick, mounted]);

  const code = React.useMemo(() => {
    if (format === "CSS") return buildCss(palette);
    if (format === "TS") return paletteToTs(palette);
    return buildJson(palette);
  }, [format, palette]);

  return (
    <Section
      id="export"
      eyebrow="Use it anywhere"
      title="Export"
      description="Export the palette — including any live edits you've made — as CSS custom properties, a TypeScript snippet, or JSON. Values are read live from the running app via getComputedStyle."
    >
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          data={["CSS", "TS", "JSON"]}
          value={format}
          onChange={(v) => {
            setTick((t) => t + 1);
            setFormat(v as Format);
          }}
          size="md"
          color="brand"
        />
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          className="rounded-[8px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-gray-50"
        >
          Refresh from live values
        </button>
        <span className="text-[12px] text-sub">
          Reflects current edited tokens.
        </span>
      </div>

      <div className="mt-4">
        <CodeBlock
          code={code}
          label={
            format === "CSS"
              ? "css · custom properties"
              : format === "TS"
                ? "ts · tokens"
                : "json"
          }
        />
      </div>
    </Section>
  );
}
