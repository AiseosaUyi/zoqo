import type { SignalSpotLesson } from "./types";

/** Foundations — chart-reading basics: candle anatomy, trend direction,
 *  support/resistance, and simple reversal shapes. Migrated verbatim from
 *  the original SignalSpot.tsx QUESTIONS array (no content changes) into
 *  the shared per-skill-file convention every other skill now follows. */
export const LESSONS: SignalSpotLesson[] = [
  {
    id: "foundations-1",
    skillId: "foundations",
    title: "Reading a shooting star",
    type: "signal-spot",
    prompt:
      "Price opens at 100, spikes to 108, sells off hard, and closes at 101 — a long upper wick with a small body near the low. What does this candle suggest?",
    candles: [{ open: 100, high: 108, low: 99.5, close: 101 }],
    options: [
      "Strong continued buying pressure",
      "Buyers pushed up but sellers took control — possible reversal down",
      "No meaningful signal",
    ],
    correctIndex: 1,
    explain:
      "A long upper wick with a small real body (a shooting-star shape) means buyers tried to push price up, but sellers overwhelmed them by the close — often an early warning of a top.",
  },
  {
    id: "foundations-2",
    skillId: "foundations",
    title: "Spotting an uptrend",
    type: "signal-spot",
    prompt: "Six candles in a row, each with a higher high and a higher low than the one before. What is this?",
    candles: [
      { open: 100, high: 103, low: 99, close: 102 },
      { open: 102, high: 105, low: 101, close: 104 },
      { open: 104, high: 107, low: 103, close: 106 },
      { open: 106, high: 109, low: 105, close: 108 },
      { open: 108, high: 111, low: 107, close: 110 },
      { open: 110, high: 113, low: 109, close: 112 },
    ],
    options: ["An uptrend", "A downtrend", "A range-bound market"],
    correctIndex: 0,
    explain:
      "Higher highs + higher lows, repeated, is the textbook definition of an uptrend — the phrase \"the trend is your friend\" is a reminder not to fight it.",
  },
  {
    id: "foundations-3",
    skillId: "foundations",
    title: "Finding support",
    type: "signal-spot",
    prompt: "Price keeps falling to 64 and bouncing back up, three times in a row. What is 64 acting as?",
    candles: [
      { open: 70, high: 71, low: 64, close: 68 },
      { open: 68, high: 72, low: 66, close: 71 },
      { open: 71, high: 73, low: 64, close: 69 },
      { open: 69, high: 74, low: 67, close: 73 },
      { open: 73, high: 75, low: 64, close: 70 },
    ],
    options: ["Resistance", "Support", "A stop-loss"],
    correctIndex: 1,
    explain: "A price floor that repeatedly holds is support — the level where buying pressure has, so far, outweighed selling.",
  },
  {
    id: "foundations-4",
    skillId: "foundations",
    title: "Reading a hammer",
    type: "signal-spot",
    prompt:
      "After a long slide down, one candle opens near the low of the move, dips slightly, then rallies to close well above the open — a small body up top with a long lower wick. What does this shape suggest?",
    candles: [{ open: 61, high: 62, low: 55, close: 61.5 }],
    options: [
      "A hammer — sellers lost control and buyers stepped in, possible reversal up",
      "A continuation of the downtrend",
      "A random, meaningless candle",
    ],
    correctIndex: 0,
    explain:
      "A long lower wick with a small body near the top is a hammer — price got sold off hard within the candle, but buyers pushed it back up by the close, often marking a bottom.",
  },
  {
    id: "foundations-5",
    skillId: "foundations",
    title: "Reading a doji",
    type: "signal-spot",
    prompt: "A candle opens at 100 and closes at 100.10, with wicks stretching both up to 104 and down to 96. What does this candle communicate?",
    candles: [{ open: 100, high: 104, low: 96, close: 100.1 }],
    options: [
      "A doji — indecision, neither buyers nor sellers won this round",
      "A strong breakout is starting",
      "Price is guaranteed to reverse next candle",
    ],
    correctIndex: 0,
    explain:
      "Open and close nearly equal, with real range on both sides, is a doji — it means the tug-of-war ended in a draw. It's a signal to watch closely, not to act on alone.",
  },
  {
    id: "foundations-6",
    skillId: "foundations",
    title: "Finding resistance",
    type: "signal-spot",
    prompt: "Every time price rallies up to 130, it stalls and turns back down — four separate times. What is 130 acting as?",
    candles: [
      { open: 122, high: 130, low: 121, close: 124 },
      { open: 124, high: 126, low: 119, close: 121 },
      { open: 121, high: 130, low: 120, close: 125 },
      { open: 125, high: 127, low: 118, close: 120 },
      { open: 120, high: 130, low: 119, close: 123 },
    ],
    options: ["Support", "Resistance", "The stop-loss level"],
    correctIndex: 1,
    explain: "A price ceiling that repeatedly rejects rallies is resistance — the level where selling pressure has, so far, outweighed buying.",
  },
  {
    id: "foundations-7",
    skillId: "foundations",
    title: "Bullish engulfing",
    type: "signal-spot",
    prompt:
      "A small red (down) candle is immediately followed by a larger green (up) candle whose body fully covers the red candle's body. What pattern is this?",
    candles: [
      { open: 101, high: 102, low: 97, close: 98 },
      { open: 97, high: 105, low: 96.5, close: 104 },
    ],
    options: [
      "A bearish engulfing pattern — expect further downside",
      "A bullish engulfing pattern — buyers overwhelmed the prior sellers",
      "Two unrelated candles with no combined meaning",
    ],
    correctIndex: 1,
    explain:
      "When a bullish candle's body fully engulfs the prior bearish candle's body, it's a bullish engulfing pattern — a sign buying pressure has decisively taken over.",
  },
  {
    id: "foundations-8",
    skillId: "foundations",
    title: "Spotting a downtrend",
    type: "signal-spot",
    prompt: "Six candles in a row, each with a lower high and a lower low than the one before. What is this?",
    candles: [
      { open: 120, high: 121, low: 117, close: 118 },
      { open: 118, high: 119, low: 114, close: 115 },
      { open: 115, high: 116, low: 111, close: 112 },
      { open: 112, high: 113, low: 108, close: 109 },
      { open: 109, high: 110, low: 105, close: 106 },
      { open: 106, high: 107, low: 102, close: 103 },
    ],
    options: ["An uptrend", "A downtrend", "A range-bound market"],
    correctIndex: 1,
    explain: "Lower highs + lower lows, repeated, is the textbook definition of a downtrend — the mirror image of foundations-2.",
  },
];
