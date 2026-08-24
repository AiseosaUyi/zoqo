import type { Candle } from "@/components/learn/PatternChart";

/** Shared content model for every Academy lesson, across all three mechanics
 *  (TERMINAL_SPEC.md §6). One `Lesson` = one skill-tree slot = one XP/hearts
 *  round — unlike the old single-lesson-with-8-questions shape, each of
 *  Foundations' 8 questions is now its own `Lesson`, which is what makes
 *  `lessonCount` (8, 12, 10, 14, 16, 18, 12 across the 7 skills) mean what it
 *  says: 90 separate, individually-completable lessons, not 7 mega-lessons. */

export type SkillId = "foundations" | "charts" | "orders" | "risk" | "indicators" | "strategy" | "psychology";

interface LessonBase {
  id: string;
  skillId: SkillId;
  title: string;
}

/** A paused chart + multiple choice — "what does this imply?". */
export interface SignalSpotLesson extends LessonBase {
  type: "signal-spot";
  candles: Candle[];
  prompt: string;
  options: string[];
  correctIndex: number;
  explain: string;
}

export interface PatternPopCandidate {
  id: string;
  candles: Candle[];
  isTarget: boolean;
}

/** Several candlestick patterns float up the screen; tap the one matching
 *  the prompt before it scrolls off. A miss (timeout) or a wrong tap costs
 *  a heart, same as a wrong Signal Spot answer. */
export interface PatternPopLesson extends LessonBase {
  type: "pattern-pop";
  targetPatternName: string;
  instructions: string;
  /** Exactly one candidate should have isTarget: true. 3-5 candidates total
   *  reads well on both desktop and the mobile-first Academy surface. */
  candidates: PatternPopCandidate[];
  explain: string;
}

export interface SafeRange {
  min: number;
  max: number;
}

/** Drag entry/stop-loss/take-profit onto a shown setup; each of the three is
 *  graded against its own safe range (partial credit, not binary). */
export interface OrderBuilderLesson extends LessonBase {
  type: "build-order";
  candles: Candle[];
  scenario: string;
  currentPrice: number;
  entryRange: SafeRange;
  stopLossRange: SafeRange;
  takeProfitRange: SafeRange;
  entryDefault: number;
  stopLossDefault: number;
  takeProfitDefault: number;
  /** Slider bounds/step shared by all three fields — set relative to this
   *  setup's own price scale (e.g. a $60-worth-of-price-action lesson needs
   *  much finer step than a $2,000 BTC swing). */
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  explain: string;
}

/** "Place this trade on the demo terminal" — deep-links into the real
 *  `/terminal` for a guided live rep instead of a synthetic setup, then
 *  reports back what happened. Graded against the real fill: side must
 *  match, size/stop-loss/take-profit are graded as % distance from entry
 *  (not absolute price, since the terminal's price is live and moving) so
 *  the safe range still means something regardless of where BTC happens to
 *  be trading when the lesson is played. */
export interface MockTradeLesson extends LessonBase {
  type: "mock-trade";
  assetId: string;
  instructions: string;
  requiredSide: "long" | "short";
  /** % of available cash at the time of the trade, not a fixed USD amount —
   *  a fixed range would either be trivial for a well-funded account or
   *  unreachable for a fresh one (terminalStore.ts's MAX_POSITION_PCT caps
   *  any single position at 10% of cash, so a fixed-dollar range can't
   *  safely assume any particular balance). */
  sizePctRange: SafeRange;
  stopLossPctRange: SafeRange;
  takeProfitPctRange: SafeRange;
  explain: string;
}

export type Lesson = SignalSpotLesson | PatternPopLesson | OrderBuilderLesson | MockTradeLesson;
