import type { Lesson } from "./types";

/** Indicators (16 lessons) — Signal Spot format throughout. `PatternChart`
 *  only renders candlesticks (no MA line / RSI subplot infrastructure), so
 *  every lesson narrates the indicator's reading in `prompt` (e.g. "the
 *  50-period average is at $142 and rising") while `candles` renders the
 *  matching real price action underneath it. Covers moving averages (what
 *  they are, trend filter, bounce/rejection, golden/death cross), RSI
 *  (what it measures, overbought/oversold with the "doesn't mean instant
 *  reversal" nuance, divergence), volume (what it represents, confirming
 *  vs. warning moves, spikes at key levels), and closes with two synthesis
 *  lessons on combining signals instead of trading any one in isolation. */
export const LESSONS: Lesson[] = [
  {
    id: "indicators-1",
    skillId: "indicators",
    title: "What a moving average smooths",
    type: "signal-spot",
    prompt:
      "Price has zigzagged sharply for eight candles — up, down, up, down — but each time you average the last 5 closes together, that average has quietly climbed from $100 to $109 without ever zigzagging itself. What is a moving average actually doing here?",
    candles: [
      { open: 100, high: 104, low: 98, close: 103 },
      { open: 103, high: 104, low: 97, close: 99 },
      { open: 99, high: 107, low: 98, close: 106 },
      { open: 106, high: 107, low: 100, close: 102 },
      { open: 102, high: 110, low: 101, close: 109 },
      { open: 109, high: 110, low: 103, close: 105 },
      { open: 105, high: 113, low: 104, close: 112 },
      { open: 112, high: 113, low: 107, close: 109 },
    ],
    options: [
      "It averages recent prices to filter out noise and reveal the underlying trend",
      "It predicts tomorrow's exact closing price",
      "It measures how many buyers vs. sellers are trading right now",
    ],
    correctIndex: 0,
    explain:
      "A moving average is just the average of the last N closes, recalculated as new candles form. Any single candle can spike or dive on noise, but averaging several together cancels much of that noise out, leaving a smoother line that tracks the broader direction — which is why traders use it as a trend gauge, not a price predictor.",
  },
  {
    id: "indicators-2",
    skillId: "indicators",
    title: "Price above a rising average",
    type: "signal-spot",
    prompt:
      "The 50-period moving average is calculated at $118 and rising slowly. Price itself has been trading between $122 and $130 for the last several candles — consistently above that average. What does this tell you about the prevailing trend?",
    candles: [
      { open: 122, high: 125, low: 120, close: 124 },
      { open: 124, high: 128, low: 123, close: 127 },
      { open: 127, high: 130, low: 125, close: 126 },
      { open: 126, high: 129, low: 124, close: 128 },
      { open: 128, high: 131, low: 126, close: 130 },
    ],
    options: [
      "The trend is up — price trading above a rising average is a classic bullish trend filter",
      "The trend is down and about to reverse",
      "The moving average is irrelevant once price moves away from it",
    ],
    correctIndex: 0,
    explain:
      "One of the simplest trend filters in technical analysis: when price sits above a rising moving average, buyers are in control on the timeframe that average measures. It doesn't guarantee price stays up, but it's the baseline read — price below a falling average would be the bearish mirror image.",
  },
  {
    id: "indicators-3",
    skillId: "indicators",
    title: "A pullback that holds the average",
    type: "signal-spot",
    prompt:
      "Price has been climbing for a while. The 20-period moving average is at $142 and rising. Price just pulled back from $150 down to touch $142, then closed back up at $146 on the next candle. What does this bounce typically signal?",
    candles: [
      { open: 130, high: 135, low: 129, close: 134 },
      { open: 134, high: 140, low: 133, close: 139 },
      { open: 139, high: 150, low: 138, close: 148 },
      { open: 148, high: 149, low: 142, close: 143 },
      { open: 143, high: 147, low: 142, close: 146 },
    ],
    options: [
      "A bullish continuation signal — the rising average is acting as dynamic support and buyers stepped back in",
      "A confirmed trend reversal to the downside",
      "Proof the moving average no longer matters",
    ],
    correctIndex: 0,
    explain:
      "In a healthy uptrend, pullbacks to a rising moving average are common — traders who missed the initial move often use that average as a place to buy. Holding there and bouncing is read as trend continuation, not a warning sign, as long as the average itself keeps rising.",
  },
  {
    id: "indicators-4",
    skillId: "indicators",
    title: "A rally rejected at the average",
    type: "signal-spot",
    prompt:
      "Price has been falling for a while. The 20-period moving average is at $95 and declining. Price rallies up from $84 to $95, stalls exactly at the average, and turns back down to close at $88. What is the moving average acting as here?",
    candles: [
      { open: 105, high: 106, low: 98, close: 99 },
      { open: 99, high: 100, low: 90, close: 91 },
      { open: 91, high: 92, low: 83, close: 84 },
      { open: 84, high: 95, low: 83, close: 93 },
      { open: 93, high: 95, low: 87, close: 88 },
    ],
    options: [
      "Dynamic resistance — the declining average is capping rallies, consistent with a downtrend still in control",
      "Dynamic support that will hold price up from here",
      "A random level with no relationship to the trend",
    ],
    correctIndex: 0,
    explain:
      "The mirror image of a moving-average bounce: in a downtrend, a falling moving average often caps relief rallies, because traders who are underwater from the decline use bounces into it as a chance to sell again. Getting rejected right at the average reinforces that the downtrend is still intact.",
  },
  {
    id: "indicators-5",
    skillId: "indicators",
    title: "A golden cross crossover",
    type: "signal-spot",
    prompt:
      "Two moving averages are plotted on the same chart: a faster 10-period average and a slower 50-period average. For weeks the fast average sat below the slow one. Now the fast average has just crossed up through the slow average from below. What is this crossover called, and what does it suggest?",
    candles: [
      { open: 110, high: 112, low: 104, close: 106 },
      { open: 106, high: 108, low: 100, close: 102 },
      { open: 102, high: 104, low: 97, close: 99 },
      { open: 99, high: 106, low: 98, close: 105 },
      { open: 105, high: 112, low: 104, close: 111 },
      { open: 111, high: 118, low: 110, close: 117 },
      { open: 117, high: 123, low: 116, close: 122 },
    ],
    options: [
      "A golden cross — the faster average crossing above the slower one, often read as a bullish signal that momentum is shifting up",
      "A death cross — a bearish signal that momentum is shifting down",
      "A doji — a sign of indecision",
    ],
    correctIndex: 0,
    explain:
      "When a shorter-period moving average crosses above a longer-period one, recent prices are now averaging higher than the longer-term average — a sign the trend may be turning up. This is nicknamed a 'golden cross' and is one of the most widely watched crossover signals, though like any single signal it works best combined with other confirmation.",
  },
  {
    id: "indicators-6",
    skillId: "indicators",
    title: "The bearish death cross",
    type: "signal-spot",
    prompt:
      "The same two averages — a faster 10-period and a slower 50-period — have been rising together with the fast one above the slow one. Now the fast average has just crossed down through the slow average from above. What is this crossover called, and what does it suggest?",
    candles: [
      { open: 130, high: 135, low: 128, close: 133 },
      { open: 133, high: 138, low: 131, close: 136 },
      { open: 136, high: 140, low: 130, close: 132 },
      { open: 132, high: 134, low: 124, close: 126 },
      { open: 126, high: 128, low: 118, close: 120 },
      { open: 120, high: 122, low: 112, close: 114 },
      { open: 114, high: 116, low: 106, close: 108 },
    ],
    options: [
      "A death cross — the faster average crossing below the slower one, often read as a bearish signal that momentum is shifting down",
      "A golden cross — a bullish signal that momentum is shifting up",
      "A hammer — a bullish reversal candle",
    ],
    correctIndex: 0,
    explain:
      "The mirror image of a golden cross: when the faster average crosses below the slower one, recent prices are now averaging lower than the longer-term trend — nicknamed a 'death cross'. It's a lagging signal (the cross confirms only after price has already turned), which is why traders often pair it with other tools rather than trading it alone.",
  },
  {
    id: "indicators-7",
    skillId: "indicators",
    title: "What RSI actually measures",
    type: "signal-spot",
    prompt:
      "RSI (Relative Strength Index) is plotted on a 0-100 scale below the price chart. It's calculated from the size and speed of recent up-moves versus down-moves — not from the price level itself. Two different assets could both read RSI 65 while trading at completely different prices. What does RSI measure?",
    candles: [
      { open: 100, high: 104, low: 99, close: 103 },
      { open: 103, high: 107, low: 102, close: 106 },
      { open: 106, high: 109, low: 105, close: 108 },
      { open: 108, high: 110, low: 106, close: 107 },
    ],
    options: [
      "Momentum — how fast and how strongly price has been moving, independent of the price level itself",
      "The exact dollar price of the asset",
      "The total trading volume over the period",
    ],
    correctIndex: 0,
    explain:
      "RSI is a momentum oscillator: it compares the size of recent gains to recent losses over a lookback period (typically 14) and expresses the result as a 0-100 reading. It says nothing about what price actually is — only how fast and forcefully it's been moving — which is why it's read as a momentum gauge, not a price target.",
  },
  {
    id: "indicators-8",
    skillId: "indicators",
    title: "RSI above 70, with a nuance",
    type: "signal-spot",
    prompt:
      "Price has rallied hard for several candles and RSI has climbed to 78 — traditionally read as 'overbought'. A trader immediately shorts, expecting an instant reversal. Price keeps grinding higher for another week while RSI stays pinned above 70 the whole time. What went wrong with the trader's read?",
    candles: [
      { open: 100, high: 106, low: 99, close: 105 },
      { open: 105, high: 112, low: 104, close: 111 },
      { open: 111, high: 118, low: 110, close: 117 },
      { open: 117, high: 124, low: 116, close: 123 },
      { open: 123, high: 130, low: 122, close: 129 },
      { open: 129, high: 136, low: 128, close: 135 },
    ],
    options: [
      "Overbought doesn't mean 'must reverse now' — in a strong trend, RSI can stay elevated for a long stretch while price keeps climbing",
      "RSI above 70 is always a guaranteed sell signal with no exceptions",
      "RSI was calculated incorrectly if price kept rising",
    ],
    correctIndex: 0,
    explain:
      "Overbought means momentum is strong, not that price is due for an immediate reversal. In a powerful trend, RSI can hover above 70 for many candles in a row while price keeps making new highs — treating 'overbought' as an automatic short signal, without other confirmation, is a common and costly misread.",
  },
  {
    id: "indicators-9",
    skillId: "indicators",
    title: "RSI below 30, with a nuance",
    type: "signal-spot",
    prompt:
      "Price has been sliding for several candles and RSI has dropped to 22 — traditionally read as 'oversold'. A trader immediately buys, expecting an instant bounce. Price keeps grinding lower for another week while RSI stays pinned below 30 the whole time. What went wrong with the trader's read?",
    candles: [
      { open: 135, high: 136, low: 129, close: 130 },
      { open: 130, high: 131, low: 124, close: 125 },
      { open: 125, high: 126, low: 118, close: 119 },
      { open: 119, high: 120, low: 112, close: 113 },
      { open: 113, high: 114, low: 106, close: 107 },
      { open: 107, high: 108, low: 100, close: 101 },
    ],
    options: [
      "Oversold doesn't mean 'must bounce now' — in a strong downtrend, RSI can stay depressed for a long stretch while price keeps falling",
      "RSI below 30 is always a guaranteed buy signal with no exceptions",
      "The chart must be fake, since RSI can't stay below 30 that long",
    ],
    correctIndex: 0,
    explain:
      "The mirror image of the overbought trap: oversold means selling momentum is strong, not that a bounce is imminent. In a strong downtrend, RSI can stay pinned below 30 for an extended stretch while price keeps making new lows — buying purely because of the oversold reading, without confirmation, can mean catching a falling knife.",
  },
  {
    id: "indicators-10",
    skillId: "indicators",
    title: "RSI divergence at a new high",
    type: "signal-spot",
    prompt:
      "Price pushes to a new high at $160, higher than its prior high of $150. But RSI at this new price high only reaches 62 — lower than the 74 it hit at that prior high. Price is making a higher high while RSI makes a lower high. What does this divergence classically warn of?",
    candles: [
      { open: 120, high: 130, low: 118, close: 128 },
      { open: 128, high: 150, low: 126, close: 148 },
      { open: 148, high: 149, low: 135, close: 138 },
      { open: 138, high: 145, low: 136, close: 142 },
      { open: 142, high: 160, low: 140, close: 158 },
    ],
    options: [
      "Bearish divergence — momentum is weakening even as price makes a new high, a classic early warning that the up-move may be running out of steam",
      "Bullish confirmation that the uptrend is accelerating",
      "Nothing — RSI and price always move in perfect lockstep, so this can't happen",
    ],
    correctIndex: 0,
    explain:
      "Divergence is one of the most-watched RSI signals: when price makes a new high but the RSI reading behind it is lower than at the prior high, fewer traders are pushing with the same force to get there — momentum is fading beneath the surface. It's a warning to watch closely, not an automatic sell (price can still grind higher), but it's a classic tell that the move is losing conviction.",
  },
  {
    id: "indicators-11",
    skillId: "indicators",
    title: "What trading volume represents",
    type: "signal-spot",
    prompt:
      "Two candles both close up $5. The first happened on 10,000 units of trading volume; the second happened on just 500 units. Both candles look identical on the price chart alone. What does the volume figure add that the candle shape alone can't tell you?",
    candles: [
      { open: 100, high: 106, low: 99, close: 105 },
      { open: 105, high: 111, low: 104, close: 110 },
    ],
    options: [
      "How much participation and conviction was behind the move — a high-volume move reflects broad agreement, a low-volume move may just be thin trading",
      "The exact direction price will move next",
      "Nothing useful — volume is purely cosmetic on a price chart",
    ],
    correctIndex: 0,
    explain:
      "Volume measures how many units actually traded — how much money and how many participants were behind a price move. Two candles can look identical in shape and still mean very different things: a $5 rally on heavy volume reflects real conviction, while the same $5 rally on thin volume could just be a handful of trades pushing price around in an illiquid moment.",
  },
  {
    id: "indicators-12",
    skillId: "indicators",
    title: "Rising price on rising volume",
    type: "signal-spot",
    prompt:
      "Price has rallied from $100 to $120 over five candles. Volume on each up candle has been progressively increasing — more units traded on the last candle than on any before it. What does rising volume alongside rising price typically confirm?",
    candles: [
      { open: 100, high: 104, low: 99, close: 103 },
      { open: 103, high: 108, low: 102, close: 107 },
      { open: 107, high: 112, low: 106, close: 111 },
      { open: 111, high: 116, low: 110, close: 115 },
      { open: 115, high: 121, low: 114, close: 120 },
    ],
    options: [
      "Conviction behind the move — increasing volume on the way up suggests genuine buying interest, not just a thin drift",
      "That the rally is fake and about to collapse",
      "Volume rising means the asset is about to be delisted",
    ],
    correctIndex: 0,
    explain:
      "When volume expands alongside a price advance, more participants are actively buying at increasingly higher prices — real demand is showing up, not just an absence of sellers. This is the healthiest-looking version of an uptrend: price and volume moving together, confirming each other.",
  },
  {
    id: "indicators-13",
    skillId: "indicators",
    title: "Rising price on falling volume",
    type: "signal-spot",
    prompt:
      "Price has continued to grind from $120 up to $130 over several candles, still making new highs. But volume on each of those up candles has been steadily shrinking compared to the volume earlier in the rally. What does this divergence between price and volume usually warn of?",
    candles: [
      { open: 120, high: 126, low: 119, close: 125 },
      { open: 125, high: 129, low: 124, close: 128 },
      { open: 128, high: 130, low: 127, close: 129 },
      { open: 129, high: 130.5, low: 128, close: 129.5 },
      { open: 129.5, high: 130.5, low: 129, close: 130 },
    ],
    options: [
      "The move may be running out of buyers — new highs on shrinking volume suggest fewer participants are willing to chase price higher",
      "The rally is strengthening and volume doesn't matter",
      "Falling volume means the exchange is malfunctioning",
    ],
    correctIndex: 0,
    explain:
      "Price can keep drifting to new highs on fumes — a handful of buyers is enough to nudge price up if sellers are scarce. But when volume shrinks as price rises, fewer and fewer participants are actually driving the move, which is a classic warning that the rally lacks the fuel to continue much further.",
  },
  {
    id: "indicators-14",
    skillId: "indicators",
    title: "A volume spike at a key level",
    type: "signal-spot",
    prompt:
      "Price has tested the $80 support level three times before, each on ordinary volume, and held. On the fourth test, price touches $80 again — but this time on a volume spike several times larger than the prior tests, and closes sharply back up at $86. What does a volume spike like this at a well-tested level often mark?",
    candles: [
      { open: 88, high: 89, low: 80, close: 85 },
      { open: 85, high: 87, low: 80, close: 84 },
      { open: 84, high: 86, low: 80, close: 83 },
      { open: 83, high: 86, low: 79, close: 86 },
    ],
    options: [
      "Real capitulation or a real defense of the level — a volume spike at a well-tested support/resistance often marks either sellers exhausting themselves or buyers stepping in decisively",
      "Nothing — a volume spike at support is always a fakeout",
      "Proof the level will never be tested again",
    ],
    correctIndex: 0,
    explain:
      "A support or resistance level tested repeatedly on light volume can eventually just fail quietly. But when a test comes with a sudden surge in participation, it often marks a real turning point: sellers finally capitulate and get absorbed by buyers, as shown here by the sharp close back up. The same kind of spike through a level, rather than off it, is what separates a genuine breakout from a low-volume fakeout — the spike is what makes the test meaningful either way.",
  },
  {
    id: "indicators-15",
    skillId: "indicators",
    title: "Why one indicator isn't enough",
    type: "signal-spot",
    prompt:
      "A trader sees RSI at 72 and immediately shorts, ignoring that price is trading above a strongly rising 50-period moving average and that volume has been climbing on every up candle. The short gets steamrolled as price keeps climbing. What's the lesson about relying on a single indicator in isolation?",
    candles: [
      { open: 100, high: 107, low: 99, close: 106 },
      { open: 106, high: 114, low: 105, close: 113 },
      { open: 113, high: 121, low: 112, close: 120 },
      { open: 120, high: 128, low: 119, close: 127 },
      { open: 127, high: 135, low: 126, close: 134 },
    ],
    options: [
      "No single indicator tells the whole story — confirming a signal across two or more independent tools (trend, momentum, volume) reduces the odds of acting on a false read",
      "RSI is a useless indicator that should never be used",
      "Moving averages and volume are unnecessary once you have RSI",
    ],
    correctIndex: 0,
    explain:
      "Every indicator has blind spots: RSI alone can't see the trend a moving average shows, and neither can see the conviction volume shows. Trading off one signal in isolation — like shorting purely because RSI looks 'overbought' while trend and volume both scream bullish — means ignoring evidence that contradicts the trade. Combining independent signals doesn't guarantee a win, but it filters out a lot of the false positives any single tool throws off on its own.",
  },
  {
    id: "indicators-16",
    skillId: "indicators",
    title: "Combining trend and divergence",
    type: "signal-spot",
    prompt:
      "Price is trading above a rising 50-period moving average at $150 — a bullish trend filter. But price just made a new high at $172 while RSI made a lower high than it did at the previous price peak of $165 — a bearish divergence. Taken together, what's the most balanced read of this setup?",
    candles: [
      { open: 130, high: 140, low: 128, close: 138 },
      { open: 138, high: 150, low: 136, close: 148 },
      { open: 148, high: 165, low: 146, close: 163 },
      { open: 163, high: 164, low: 150, close: 154 },
      { open: 154, high: 160, low: 152, close: 158 },
      { open: 158, high: 172, low: 156, close: 170 },
    ],
    options: [
      "The underlying trend is still intact (price above a rising average), but the divergence is a caution flag — momentum is weakening beneath the new high, worth watching rather than ignoring",
      "The divergence cancels out the trend signal entirely — you should assume price is about to crash",
      "The trend signal cancels out the divergence entirely — divergence can safely be ignored whenever price is above a moving average",
    ],
    correctIndex: 0,
    explain:
      "This is what combining signals looks like in practice: the trend filter (price above a rising average) says buyers still control the tape, while the momentum signal (bearish divergence) says that control is showing early cracks. Neither erases the other — the honest read is 'still bullish, but momentum is fading, tighten risk management and watch for confirmation of a turn' rather than an all-or-nothing call from either signal alone.",
  },
];
