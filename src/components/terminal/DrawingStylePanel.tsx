"use client";
import { Trash2, X } from "lucide-react";
import type { DrawingStyle } from "lightweight-charts-drawing";
import { SegmentedControl, Slider, Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Curated swatch set — canonical `base: "500"` step of each PALETTE ramp
 *  (tokens.ts), not raw hex picked ad hoc. Canvas 2D (what the drawing
 *  library paints through) can't resolve `var(--color-*)`, so these are
 *  literal values, same constraint TerminalChart's indicator colors work
 *  around (see OVERLAY_COLOR there). */
const SWATCHES = [
  { key: "purple", hex: "#601FFF", label: "Purple" },
  { key: "blue", hex: "#0047FF", label: "Blue" },
  { key: "green", hex: "#27AE60", label: "Green" },
  { key: "red", hex: "#FF2E00", label: "Red" },
  { key: "orange", hex: "#FF7300", label: "Orange" },
  { key: "gold", hex: "#FEAE14", label: "Gold" },
  { key: "gray", hex: "#5C584F", label: "Gray" },
] as const;

const STROKE_WIDTHS = [
  { value: "1", label: "Thin" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Thick" },
];

export interface StylePanelPosition {
  /** Anchor point in the chart container's own pixel space (not viewport/
   *  page space) — the panel is positioned relative to its own
   *  `position: absolute` parent, which must be the same container. */
  x: number;
  y: number;
  containerWidth: number;
  containerHeight: number;
}

const PANEL_WIDTH = 208;
const PANEL_HEIGHT = 132;
const PANEL_MARGIN = 10;

export function DrawingStylePanel({
  style,
  position,
  onChange,
  onDelete,
  onClose,
}: {
  style: DrawingStyle;
  position: StylePanelPosition;
  onChange: (patch: Partial<DrawingStyle>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { x, y, containerWidth, containerHeight } = position;

  // Edge-aware placement (design review Pass 1): float anchored to the
  // shape by default, but flip to whichever side of the anchor point still
  // has room, so the panel never runs off-screen near a chart edge.
  const flipUp = y + PANEL_MARGIN + PANEL_HEIGHT > containerHeight;
  const top = flipUp ? Math.max(PANEL_MARGIN, y - PANEL_HEIGHT - PANEL_MARGIN) : y + PANEL_MARGIN;
  const left = Math.min(Math.max(PANEL_MARGIN, x - PANEL_WIDTH / 2), Math.max(PANEL_MARGIN, containerWidth - PANEL_WIDTH - PANEL_MARGIN));

  const fillOpacityPct = Math.round((style.fillOpacity ?? 0.15) * 100);

  return (
    <div
      className="absolute z-20 flex flex-col gap-2.5 rounded-chip border border-line bg-surface p-2.5 shadow-e3"
      style={{ left, top, width: PANEL_WIDTH }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-sub">Style</span>
        <div className="flex items-center gap-0.5">
          <Tooltip label="Delete">
            <button
              type="button"
              onClick={onDelete}
              className="grid h-6 w-6 place-items-center rounded-chip text-sub transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Close">
            <button
              type="button"
              onClick={onClose}
              className="grid h-6 w-6 place-items-center rounded-chip text-sub transition-colors hover:bg-gray-50 hover:text-ink"
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {SWATCHES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-label={s.label}
            onClick={() => onChange({ lineColor: s.hex, fillColor: s.hex })}
            className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-full ring-offset-1 transition-shadow",
              style.lineColor === s.hex ? "ring-2 ring-ink" : "ring-1 ring-line",
            )}
            style={{ backgroundColor: s.hex }}
          >
            {/* Selection is never color-alone (colorblind-safe per design
             *  review Pass 6): a visible checkmark ring + a white dot marks
             *  the active swatch instead of relying on the ring color. */}
            {style.lineColor === s.hex && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </button>
        ))}
      </div>

      <SegmentedControl
        data={STROKE_WIDTHS}
        value={String(style.lineWidth ?? 2)}
        onChange={(v) => onChange({ lineWidth: Number(v) })}
        size="xs"
        fullWidth
      />

      <Slider
        label="Fill opacity"
        value={fillOpacityPct}
        min={0}
        max={100}
        step={5}
        formatValue={(v) => `${v}%`}
        onChange={(v) => onChange({ fillOpacity: v / 100 })}
      />
    </div>
  );
}
