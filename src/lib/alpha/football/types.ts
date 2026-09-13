/** Shared types across the football math modules (elo.ts, dixonColes.ts,
 *  models.ts, metrics.ts) — split out because `OneXTwoProbabilities` had
 *  drifted into three independent, structurally-identical declarations
 *  during Phase 3's build. Structural typing meant it still compiled, but
 *  three copies of the same shape is exactly the repetition worth
 *  collapsing before more modules import from any one of them. */
export interface OneXTwoProbabilities {
  home: number;
  draw: number;
  away: number;
}

export type OneXTwoOutcome = "home" | "draw" | "away";
