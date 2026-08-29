import type { Lesson } from "./types";

/** Reading a Chart (12 lessons) — candlestick/chart-pattern recognition is
 *  Pattern Pop's exact wheelhouse, so this skill leans on it heavily
 *  (charts-1 through charts-5: engulfing, morning/evening star, three white
 *  soldiers/black crows), with Signal Spot for concepts that don't reduce to
 *  "spot the pattern" — multi-candle patterns too wide for Pattern Pop's
 *  mini-sparkline (double top/bottom, wedges, bull flag), and prompt-driven
 *  concepts with no single tappable shape (gaps, timeframes, volume). */
export const LESSONS: Lesson[] = [
  {
    id: "charts-1",
    skillId: "charts",
    title: "Spot the bullish engulfing",
    type: "pattern-pop",
    targetPatternName: "Bullish Engulfing",
    instructions: "Tap the Bullish Engulfing pattern before it floats off the top of the screen.",
    candidates: [
      {
        id: "a",
        isTarget: true,
        candles: [
          { open: 101, high: 102, low: 97, close: 98 },
          { open: 97, high: 105, low: 96.5, close: 104 },
        ],
      },
      {
        id: "b",
        isTarget: false,
        candles: [
          { open: 98, high: 105, low: 97.5, close: 104 },
          { open: 104, high: 105, low: 99, close: 100 },
        ],
      },
      {
        id: "c",
        isTarget: false,
        candles: [
          { open: 100, high: 101, low: 99, close: 100.2 },
          { open: 100.1, high: 100.9, low: 99.3, close: 100 },
        ],
      },
      {
        id: "d",
        isTarget: false,
        candles: [
          { open: 100, high: 106, low: 99, close: 105 },
          { open: 105, high: 106, low: 101, close: 102 },
        ],
      },
    ],
    explain:
      "The target's second candle is a green body that fully covers the prior red candle's body — a bullish engulfing pattern. \"b\" is the mirror-image bearish version (green then a larger red), \"c\" is two indecisive dojis, and \"d\" is bearish (green then a smaller red that doesn't engulf it).",
  },
  {
    id: "charts-2",
    skillId: "charts",
    title: "Spotting a morning star",
    type: "pattern-pop",
    targetPatternName: "Morning Star",
    instructions: "Tap the Morning Star pattern before it floats off the top of the screen.",
    candidates: [
      {
        id: "a",
        isTarget: true,
        candles: [
          { open: 110, high: 110.5, low: 100, close: 101 },
          { open: 99, high: 100.5, low: 97, close: 99.5 },
          { open: 100, high: 108, low: 99.5, close: 107 },
        ],
      },
      {
        id: "b",
        isTarget: false,
        candles: [
          { open: 100, high: 110, low: 99.5, close: 109 },
          { open: 110, high: 111, low: 109, close: 110.3 },
          { open: 109, high: 109.5, low: 101, close: 102 },
        ],
      },
      {
        id: "c",
        isTarget: false,
        candles: [
          { open: 110, high: 110.5, low: 104, close: 105 },
          { open: 105, high: 105.5, low: 99, close: 100 },
          { open: 100, high: 100.5, low: 94, close: 95 },
        ],
      },
      {
        id: "d",
        isTarget: false,
        candles: [
          { open: 110, high: 110.5, low: 100, close: 101 },
          { open: 99, high: 100, low: 97, close: 98.5 },
          { open: 98, high: 101, low: 97.5, close: 100.5 },
        ],
      },
    ],
    explain:
      "A long red candle, then a small-bodied candle that gaps down (indecision), then a long green candle that closes back above the midpoint of the first candle's body — that's a morning star, a three-candle bullish reversal. \"b\" is the mirror-image bearish evening star, \"c\" is just three long red candles with no indecisive middle candle (plain continuation, not a reversal), and \"d\" has the right shape but the third candle is too weak — it never closes back above the first candle's midpoint, so the reversal isn't confirmed.",
  },
  {
    id: "charts-3",
    skillId: "charts",
    title: "Spotting an evening star",
    type: "pattern-pop",
    targetPatternName: "Evening Star",
    instructions: "Tap the Evening Star pattern before it floats off the top of the screen.",
    candidates: [
      {
        id: "a",
        isTarget: true,
        candles: [
          { open: 100, high: 110, low: 99.5, close: 109 },
          { open: 110, high: 111.5, low: 109.5, close: 110.4 },
          { open: 109, high: 109.5, low: 101, close: 102 },
        ],
      },
      {
        id: "b",
        isTarget: false,
        candles: [
          { open: 110, high: 110.5, low: 100, close: 101 },
          { open: 99, high: 100.3, low: 97.5, close: 99.5 },
          { open: 100, high: 108, low: 99.5, close: 107 },
        ],
      },
      {
        id: "c",
        isTarget: false,
        candles: [
          { open: 100, high: 106, low: 99.5, close: 105 },
          { open: 105, high: 111, low: 104.5, close: 110 },
          { open: 110, high: 116, low: 109.5, close: 115 },
        ],
      },
      {
        id: "d",
        isTarget: false,
        candles: [
          { open: 100, high: 110, low: 99.5, close: 109 },
          { open: 110, high: 111, low: 109.3, close: 110.5 },
          { open: 110, high: 110.5, low: 106, close: 107 },
        ],
      },
    ],
    explain:
      "A long green candle, then a small-bodied candle that gaps up (indecision), then a long red candle that closes back below the midpoint of the first candle's body — that's an evening star, the bearish mirror of the morning star. \"b\" is the bullish morning star, \"c\" is three long green candles with no indecisive middle candle (plain continuation), and \"d\" has the right shape but the third candle is too weak — it closes above the first candle's midpoint, so the reversal isn't confirmed.",
  },
  {
    id: "charts-4",
    skillId: "charts",
    title: "Three white soldiers",
    type: "pattern-pop",
    targetPatternName: "Three White Soldiers",
    instructions: "Tap the Three White Soldiers pattern before it floats off the top of the screen.",
    candidates: [
      {
        id: "a",
        isTarget: true,
        candles: [
          { open: 100, high: 104.5, low: 99.5, close: 104 },
          { open: 103, high: 108.5, low: 102.5, close: 108 },
          { open: 107, high: 112.5, low: 106.5, close: 112 },
        ],
      },
      {
        id: "b",
        isTarget: false,
        candles: [
          { open: 112, high: 112.5, low: 107.5, close: 108 },
          { open: 109, high: 109.5, low: 103.5, close: 104 },
          { open: 105, high: 105.5, low: 99.5, close: 100 },
        ],
      },
      {
        id: "c",
        isTarget: false,
        candles: [
          { open: 100, high: 108, low: 99.5, close: 103 },
          { open: 103, high: 111, low: 102.5, close: 106 },
          { open: 106, high: 114, low: 105.5, close: 109 },
        ],
      },
      {
        id: "d",
        isTarget: false,
        candles: [
          { open: 100, high: 110, low: 99.5, close: 109 },
          { open: 109, high: 110, low: 108, close: 109.3 },
          { open: 109.3, high: 110.3, low: 108.3, close: 109.5 },
        ],
      },
    ],
    explain:
      "Three long green candles in a row, each opening inside the prior candle's body and closing near its own high — steady, orderly buying with no big wicks. That's three white soldiers, a bullish continuation signal. \"b\" is the mirror-image bearish three black crows, \"c\" has long upper wicks on every candle (buyers keep getting rejected near the highs — a warning sign, not clean continuation), and \"d\" is one strong green candle followed by two tiny indecisive candles, not three sustained pushes.",
  },
  {
    id: "charts-5",
    skillId: "charts",
    title: "Three black crows",
    type: "pattern-pop",
    targetPatternName: "Three Black Crows",
    instructions: "Tap the Three Black Crows pattern before it floats off the top of the screen.",
    candidates: [
      {
        id: "a",
        isTarget: true,
        candles: [
          { open: 112, high: 112.5, low: 107.5, close: 108 },
          { open: 109, high: 109.5, low: 103.5, close: 104 },
          { open: 105, high: 105.5, low: 99.5, close: 100 },
        ],
      },
      {
        id: "b",
        isTarget: false,
        candles: [
          { open: 100, high: 104.5, low: 99.5, close: 104 },
          { open: 103, high: 108.5, low: 102.5, close: 108 },
          { open: 107, high: 112.5, low: 106.5, close: 112 },
        ],
      },
      {
        id: "c",
        isTarget: false,
        candles: [
          { open: 112, high: 112.5, low: 104, close: 109 },
          { open: 109, high: 109.5, low: 101, close: 106 },
          { open: 106, high: 106.5, low: 98, close: 103 },
        ],
      },
      {
        id: "d",
        isTarget: false,
        candles: [
          { open: 112, high: 112.5, low: 102, close: 103 },
          { open: 103, high: 104, low: 102, close: 102.7 },
          { open: 102.7, high: 103.7, low: 101.7, close: 102.5 },
        ],
      },
    ],
    explain:
      "Three long red candles in a row, each opening inside the prior candle's body and closing near its own low — steady, orderly selling with no big wicks. That's three black crows, a bearish continuation signal. \"b\" is the mirror-image bullish three white soldiers, \"c\" has long lower wicks on every candle (sellers keep getting rejected near the lows — a warning sign, not clean continuation), and \"d\" is one sharp red candle followed by two tiny indecisive candles, not three sustained pushes.",
  },
  {
    id: "charts-6",
    skillId: "charts",
    title: "Finding a double top",
    type: "signal-spot",
    prompt:
      "Price rallies up to 130, pulls back to around 118, rallies again and touches 130 a second time, then turns down hard and breaks below the 118 pullback level. What pattern is this?",
    candles: [
      { open: 110, high: 118, low: 109, close: 117 },
      { open: 117, high: 130, low: 116, close: 128 },
      { open: 128, high: 129, low: 118, close: 119 },
      { open: 119, high: 120, low: 115, close: 118 },
      { open: 118, high: 129, low: 117, close: 127 },
      { open: 127, high: 130, low: 126, close: 127.5 },
      { open: 127, high: 128, low: 115, close: 116 },
    ],
    options: [
      "A double top — a bearish reversal pattern",
      "A double bottom — a bullish reversal pattern",
      "Just a normal continuation of the uptrend",
    ],
    correctIndex: 0,
    explain:
      "Two peaks at roughly the same resistance level with a pullback (the \"neckline\") between them is a double top. The failure to make a real new high on the second attempt shows buyers are running out of strength — when price then breaks below the neckline, it confirms sellers have taken control and the prior uptrend has likely reversed.",
  },
  {
    id: "charts-7",
    skillId: "charts",
    title: "Finding a double bottom",
    type: "signal-spot",
    prompt:
      "Price falls to 108, bounces up to around 122, falls again and touches 108 a second time, then reverses up hard and breaks above the 122 bounce level. What pattern is this?",
    candles: [
      { open: 130, high: 131, low: 120, close: 121 },
      { open: 121, high: 122, low: 108, close: 110 },
      { open: 110, high: 120, low: 109, close: 119 },
      { open: 119, high: 122, low: 118, close: 121 },
      { open: 121, high: 122, low: 109, close: 111 },
      { open: 111, high: 112, low: 108, close: 110.5 },
      { open: 110.5, high: 123, low: 110, close: 122 },
    ],
    options: [
      "A double bottom — a bullish reversal pattern",
      "A double top — a bearish reversal pattern",
      "Just random chop with no signal",
    ],
    correctIndex: 0,
    explain:
      "Two troughs at roughly the same support level with a bounce (the \"neckline\") between them is a double bottom — the mirror image of a double top. The failure to make a real new low on the second attempt shows sellers are running out of strength — when price then breaks above the neckline, it confirms buyers have taken control.",
  },
  {
    id: "charts-8",
    skillId: "charts",
    title: "Rising vs falling wedges",
    type: "signal-spot",
    prompt:
      "Price grinds higher for five candles in a row — each with a higher high and a higher low than the last — but the distance between each candle's high and low keeps shrinking, like the price is being squeezed into a narrowing upward channel. Then it breaks down hard through the rising trendline connecting the lows. What does this pattern typically signal?",
    candles: [
      { open: 100, high: 106, low: 98, close: 105 },
      { open: 105, high: 110, low: 103, close: 109 },
      { open: 109, high: 113, low: 107, close: 112 },
      { open: 112, high: 115, low: 110, close: 114 },
      { open: 114, high: 116, low: 112, close: 113 },
      { open: 113, high: 114, low: 108, close: 109 },
    ],
    options: [
      "A rising wedge — narrowing upward momentum that often breaks down, a bearish signal",
      "A falling wedge — narrowing downward momentum that often breaks up, a bullish signal",
      "A healthy uptrend with no special significance",
    ],
    correctIndex: 0,
    explain:
      "A rising wedge is two upward-sloping trendlines that converge — price keeps making higher highs and higher lows, but each new push is weaker than the last (the range keeps shrinking), showing buying pressure running out of gas. Despite the upward slope, wedges are considered a reversal pattern: a rising wedge usually resolves by breaking down, which is exactly what confirms it. Its mirror image, a falling wedge (a narrowing downward channel), usually resolves by breaking up — bullish.",
  },
  {
    id: "charts-9",
    skillId: "charts",
    title: "Reading a bull flag",
    type: "signal-spot",
    prompt:
      "Price makes one sharp, strong rally in a single big green candle (the \"flagpole\"), then consolidates in a tight range that drifts slightly downward for a few candles, then breaks out upward again in the same direction as the original rally. What is this setup called?",
    candles: [
      { open: 100, high: 101, low: 99, close: 100.5 },
      { open: 100.5, high: 112, low: 100, close: 111 },
      { open: 111, high: 111.5, low: 109, close: 110 },
      { open: 110, high: 110.5, low: 108.5, close: 109.5 },
      { open: 109.5, high: 110, low: 108, close: 109 },
      { open: 109, high: 115, low: 108.5, close: 114.5 },
    ],
    options: [
      "A bull flag — a continuation pattern",
      "A double top — a reversal pattern",
      "A dead cat bounce with no real follow-through",
    ],
    correctIndex: 0,
    explain:
      "A bull flag is a sharp move (the flagpole) followed by a brief, controlled pullback or sideways drift (the flag) as the market digests the move before continuing in the same direction. The tight, orderly consolidation — rather than a sharp reversal — is what distinguishes it from an actual top. Traders often watch for a breakout above the flag's upper edge, on rising volume, to confirm the continuation rather than assuming it automatically.",
  },
  {
    id: "charts-10",
    skillId: "charts",
    title: "Understanding price gaps",
    type: "signal-spot",
    prompt:
      "One candle closes at 102 with a high of 103. The next candle opens at 108 — well above that prior high, leaving empty space between the two candles' price ranges — before continuing to trade higher. What does that empty space between the candles represent?",
    candles: [
      { open: 100, high: 103, low: 99, close: 102 },
      { open: 108, high: 110, low: 107, close: 109 },
    ],
    options: [
      "A gap up — price jumped to a new level with no trading in between",
      "A wick — an intra-candle rejection of higher prices",
      "A charting error that should be ignored",
    ],
    correctIndex: 0,
    explain:
      "A gap happens when price opens beyond the previous candle's range, leaving a visible empty space on the chart — no trades occurred at those in-between prices, usually because of news or a sudden imbalance of buy/sell orders. A gap up (price jumps higher, like here) often reflects a burst of buying pressure; a gap down is the mirror case. Gaps can act as support/resistance zones afterward, and traders talk about a gap \"filling\" when price later trades back through that empty space.",
  },
  {
    id: "charts-11",
    skillId: "charts",
    title: "Same chart, different timeframe",
    type: "signal-spot",
    prompt:
      "This single candle represents one full trading day for an asset — it opens at 100, ranges up to 104 and down to 96, and closes at 98, a red day overall. If you zoomed into a 5-minute chart of that exact same day, you'd see dozens of individual candles — some green, some red — netting out to this one bigger red candle. What does this tell you about reading \"the trend\" from any single chart?",
    candles: [{ open: 100, high: 104, low: 96, close: 98 }],
    options: [
      "The trend you see always depends on the timeframe you're looking at — a downtrend on one timeframe can contain plenty of uptrends on a smaller one",
      "Lower timeframes are always more accurate than higher timeframes",
      "A daily candle and a 5-minute candle always show the exact same pattern, just scaled",
    ],
    correctIndex: 0,
    explain:
      "Every candle on a higher timeframe (like a daily chart) is built out of many smaller candles on a lower timeframe (like 5-minute). A single red daily candle can easily contain a 5-minute chart full of both green and red candles — a local rally inside a bigger down day, or vice versa. Neither timeframe is \"more true\" than the other; they just answer different questions. This is why traders pick a timeframe that matches their holding period, and why a pattern that matters on one timeframe (like a hammer) can be meaningless noise on another.",
  },
  {
    id: "charts-12",
    skillId: "charts",
    title: "Volume confirms the move",
    type: "signal-spot",
    prompt:
      "Price has been quietly consolidating in a tight range around 100-101 for a couple of candles on low volume. Then it breaks out with a large green candle up to 111 — and that breakout candle prints on volume roughly three times the recent average. What does the heavy volume on the breakout suggest?",
    candles: [
      { open: 100, high: 101, low: 99, close: 100.5 },
      { open: 100.5, high: 101.2, low: 100, close: 100.8 },
      { open: 100.8, high: 112, low: 100.5, close: 111 },
    ],
    options: [
      "The move is backed by real conviction — strong participation makes the breakout more likely to hold",
      "High volume on a breakout is a bad sign and usually means the move will immediately reverse",
      "Volume is irrelevant to how much you should trust a price move",
    ],
    correctIndex: 0,
    explain:
      "Volume measures how much participation is behind a price move — think of it as the market's \"conviction\" meter. A breakout on low volume is more likely to be a false move, since few traders actually committed real size to it, and it can reverse just as quickly. A breakout on volume well above the recent average means many traders are voting with real size in the same direction, making the move more credible and more likely to follow through. The inverse matters too: a price move on shrinking volume is a warning sign the trend may be running out of participants, even if price keeps drifting the same way for now.",
  },
];
