// Shared horizontal geometry for the multi-market timeline. The column header
// and the price chart are full-width siblings, so if they map time→x with the
// SAME padding and domain they line up to the pixel: every market card sits
// directly above its chart band.

export interface TimelineGeo {
  width: number; // measured px width of the timeline (header == chart)
  padL: number; // left inset (matches the chart's left axis gutter)
  padR: number; // right inset (the price-axis gutter)
  t0: number; // domain start (epoch ms) — left edge of the plot
  t1: number; // domain end (epoch ms) — right edge of the plot
}

/** Left/right gutters shared by the column header and the price chart. */
export const PAD_LEFT = 8;
export const PAD_RIGHT = 64;

/** Plot width = the band region between the two gutters. */
export const plotWidth = (g: Pick<TimelineGeo, "width" | "padL" | "padR">) =>
  Math.max(1, g.width - g.padL - g.padR);

/** Map an epoch-ms time to an x pixel in the shared coordinate space. */
export function timeToX(g: TimelineGeo, t: number): number {
  return g.padL + ((t - g.t0) / (g.t1 - g.t0 || 1)) * plotWidth(g);
}
