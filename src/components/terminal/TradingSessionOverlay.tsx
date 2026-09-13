"use client";

export interface PixelSessionBand {
  key: string;
  label: string;
  color: string;
  left: number;
  right: number;
}

/** Background session-hour bands — same "diagonal hatch behind the chart"
 *  spirit as `/trade`'s MarketChart "NOT YET TRADED" zone, but solid
 *  low-opacity color per session rather than hatching (four overlapping
 *  sessions hatched together would just be visual noise). Painted BEHIND
 *  the chart canvas: it's the first child in the chart's relative
 *  container, and the chart itself has `background: transparent`, so this
 *  shows through everywhere the candles/grid don't paint over it. Purely
 *  decorative — `pointer-events-none` throughout so it never intercepts
 *  drawing-tool clicks. */
export function TradingSessionOverlay({ bands, height }: { bands: PixelSessionBand[]; height: number }) {
  if (bands.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bands.map((b) => {
        const width = b.right - b.left;
        if (width <= 0) return null;
        return (
          <div
            key={b.key}
            className="absolute top-0"
            style={{ left: b.left, width, height, backgroundColor: b.color, opacity: 0.05 }}
          >
            {width > 46 && (
              <span
                className="absolute left-1 top-1 whitespace-nowrap text-[9.5px] font-semibold"
                style={{ color: b.color, opacity: 0.9 }}
              >
                {b.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
