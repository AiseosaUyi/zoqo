import type { Lesson } from "./types";

/** Strategy Basics (18 lessons) — trend-following vs. mean-reversion vs.
 *  breakout/range strategies, and picking the one that fits the market in
 *  front of you. Signal Spot lessons teach recognition (which family of
 *  strategy does this setup call for, and why); Build the Order lessons
 *  size an entry once the strategy has been identified. */
export const LESSONS: Lesson[] = [
  {
    id: "strategy-1",
    skillId: "strategy",
    title: "What is trend-following",
    type: "signal-spot",
    prompt:
      "A trader waits for BTC to establish a clear direction, then buys and holds while that direction continues — planning to exit only once the trend shows real signs of reversing. What is this strategy called?",
    candles: [
      { open: 200, high: 204, low: 199, close: 203 },
      { open: 203, high: 207, low: 202, close: 206 },
      { open: 206, high: 210, low: 205, close: 209 },
      { open: 209, high: 213, low: 208, close: 212 },
      { open: 212, high: 216, low: 211, close: 215 },
      { open: 215, high: 219, low: 214, close: 218 },
    ],
    options: [
      "Trend-following — ride an established direction for as long as it holds",
      "Mean-reversion — bet the price snaps back toward its average",
      "Arbitrage — profit from a price difference between two venues",
    ],
    correctIndex: 0,
    explain:
      "Trend-following is a philosophy, not a single setup: identify a direction that's already in motion, get positioned with it, and stay with it — the bet is that a trend, once established, is more likely to continue than to reverse.",
  },
  {
    id: "strategy-2",
    skillId: "strategy",
    title: "What is mean-reversion",
    type: "signal-spot",
    prompt:
      "A trader notices price has stretched far above its recent average and bets it will fall back toward that average, rather than continuing higher. What is this strategy called?",
    candles: [
      { open: 98, high: 100, low: 97, close: 99 },
      { open: 99, high: 101, low: 98, close: 100 },
      { open: 100, high: 108, low: 99, close: 107 },
      { open: 107, high: 115, low: 106, close: 114 },
      { open: 114, high: 114, low: 108, close: 109 },
    ],
    options: [
      "Trend-following — buy the strength and expect it to keep going",
      "Mean-reversion — bet that a price stretched too far from its average snaps back toward it",
      "Breakout trading — buy the move because it broke a level",
    ],
    correctIndex: 1,
    explain:
      "Mean-reversion is the opposite philosophy to trend-following: the further and faster price stretches away from its recent average, the more likely a snap-back becomes — the bet is on the rubber band, not the direction of travel.",
  },
  {
    id: "strategy-3",
    skillId: "strategy",
    title: "Spot a trend-following setup",
    type: "signal-spot",
    prompt:
      "BTC has been in a strong uptrend for weeks. It just pulled back to a rising 20-period moving average and is now turning back up. Which strategy fits this setup?",
    candles: [
      { open: 150, high: 155, low: 149, close: 154 },
      { open: 154, high: 159, low: 153, close: 158 },
      { open: 158, high: 163, low: 157, close: 162 },
      { open: 162, high: 164, low: 158, close: 159 },
      { open: 159, high: 160, low: 155, close: 156 },
      { open: 156, high: 161, low: 155, close: 160 },
    ],
    options: [
      "Trend-following — buy the pullback in the direction of the established trend",
      "Mean-reversion — fade the pullback and sell it back down",
      "Neither — the setup gives no useful information",
    ],
    correctIndex: 0,
    explain:
      "A shallow pullback to a rising moving average, inside an already-established uptrend, is the classic trend-following entry: it lets you join a trend that's already proven itself, at a better price than chasing the highs.",
  },
  {
    id: "strategy-4",
    skillId: "strategy",
    title: "Spot a mean-reversion setup",
    type: "signal-spot",
    prompt:
      "BTC spiked hard in an hour on no real news, well outside its recent range, and just printed its first red candle back down. Which strategy fits this setup?",
    candles: [
      { open: 100, high: 102, low: 98, close: 101 },
      { open: 101, high: 103, low: 99, close: 102 },
      { open: 102, high: 112, low: 101, close: 111 },
      { open: 111, high: 118, low: 110, close: 117 },
      { open: 117, high: 117, low: 109, close: 110 },
    ],
    options: [
      "Trend-following — buy the spike and expect it to keep extending",
      "Mean-reversion — fade the spike, expecting price to pull back toward the recent range",
      "Breakout trading — buy above the spike's high",
    ],
    correctIndex: 1,
    explain:
      "A sharp, newsless spike well outside the recent range is exactly the kind of overextension mean-reversion looks for — the first red candle back down is often the first sign the stretch has gone too far to hold.",
  },
  {
    id: "strategy-5",
    skillId: "strategy",
    title: "The falling-knife risk",
    type: "signal-spot",
    prompt:
      "BTC is in a powerful, sustained downtrend with no support in sight. A trader keeps buying every dip, expecting a bounce back to the average, and keeps getting stopped out as price keeps falling. What's happening here?",
    candles: [
      { open: 200, high: 202, low: 190, close: 192 },
      { open: 192, high: 195, low: 182, close: 184 },
      { open: 184, high: 188, low: 174, close: 176 },
      { open: 176, high: 179, low: 165, close: 167 },
      { open: 167, high: 170, low: 158, close: 160 },
    ],
    options: [
      "Smart trading — dips in a downtrend always bounce eventually",
      "\"Catching a falling knife\" — mean-reversion is riskier against a strong trend, because the average itself keeps sliding down with it",
      "Correct trend-following execution",
    ],
    correctIndex: 1,
    explain:
      "In a strong trend, the \"average\" price isn't standing still — it's moving with the trend. A mean-reversion buyer expecting a snap-back to a fixed level keeps getting run over, because there's no stable level to revert to yet. That's the classic falling-knife trap.",
  },
  {
    id: "strategy-6",
    skillId: "strategy",
    title: "Trend-following in chop",
    type: "signal-spot",
    prompt:
      "A trader is trend-following BTC, but price has entered a tight, choppy range with no clear direction — every small breakout reverses within a few candles. What tends to happen to trend-following strategies here?",
    candles: [
      { open: 100, high: 104, low: 99, close: 103 },
      { open: 103, high: 105, low: 98, close: 99 },
      { open: 99, high: 103, low: 97, close: 102 },
      { open: 102, high: 104, low: 97, close: 98 },
      { open: 98, high: 102, low: 96, close: 101 },
      { open: 101, high: 103, low: 96, close: 97 },
    ],
    options: [
      "They perform best in choppy, directionless markets",
      "They tend to give back profit repeatedly — false breakouts trigger entries just before price whipsaws back the other way",
      "They become risk-free once a range forms",
    ],
    correctIndex: 1,
    explain:
      "Trend-following needs a real, sustained move to pay off. In a choppy range, every small push looks like the start of a trend, gets bought or sold, and then reverses — repeatedly stopping the trader out just before the whipsaw turns back. This is the strategy's worst environment.",
  },
  {
    id: "strategy-7",
    skillId: "strategy",
    title: "Size a trend pullback long",
    type: "build-order",
    scenario:
      "BTC has been in a strong uptrend, climbing from 150 to 210. It just pulled back to the rising 20-period average near 195 and printed a bullish reversal candle. You want to buy the pullback and ride the trend. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 150, high: 180, low: 148, close: 178 },
      { open: 178, high: 200, low: 176, close: 198 },
      { open: 198, high: 210, low: 196, close: 208 },
      { open: 208, high: 209, low: 196, close: 198 },
      { open: 198, high: 199, low: 193, close: 195 },
      { open: 195, high: 202, low: 194, close: 201 },
    ],
    currentPrice: 201,
    entryDefault: 201,
    stopLossDefault: 191,
    takeProfitDefault: 220,
    entryRange: { min: 198, max: 204 },
    stopLossRange: { min: 188, max: 193 },
    takeProfitRange: { min: 212, max: 230 },
    sliderMin: 180,
    sliderMax: 240,
    sliderStep: 0.5,
    explain:
      "Entry close to the current price (198-204) buys the reversal, not a chase. The stop belongs just under the pullback low of 193 (188-193) — the level that, if broken, means the pullback failed and the trend may be over. A take-profit of 212-230 keeps reward roughly 1.5-2x the risk, sized for the trend to keep extending, not just to cover the pullback.",
  },
  {
    id: "strategy-8",
    skillId: "strategy",
    title: "Size a trend pullback short",
    type: "build-order",
    scenario:
      "BTC has been in a persistent downtrend, falling from 300 to 240. It just bounced up to the declining 20-period average near 255 and rolled over with a bearish reversal candle. You want to short the bounce and ride the trend down. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 300, high: 302, low: 270, close: 272 },
      { open: 272, high: 274, low: 250, close: 252 },
      { open: 252, high: 256, low: 240, close: 242 },
      { open: 242, high: 254, low: 241, close: 252 },
      { open: 252, high: 257, low: 250, close: 255 },
      { open: 255, high: 256, low: 244, close: 246 },
    ],
    currentPrice: 246,
    entryDefault: 246,
    stopLossDefault: 259,
    takeProfitDefault: 222,
    entryRange: { min: 242, max: 250 },
    stopLossRange: { min: 257, max: 262 },
    takeProfitRange: { min: 210, max: 230 },
    sliderMin: 200,
    sliderMax: 310,
    sliderStep: 1,
    explain:
      "Trend-following works in either direction — this is the mirror image of the long pullback. Entry near 242-250 sells the rollover, not the peak of the bounce. The stop sits just above the bounce high near 257-262: if the bounce keeps climbing past there, the downtrend read is wrong. The target (210-230) is sized for the downtrend to keep extending toward new lows, again roughly 1.5-2x the risk taken.",
  },
  {
    id: "strategy-9",
    skillId: "strategy",
    title: "Size a range-low reversion buy",
    type: "build-order",
    scenario:
      "BTC has been chopping in a range between 90 support and 110 resistance for two weeks. It just spiked down to 88 on a wick, piercing support, and is curling back up. You want to buy this mean-reversion bounce back toward the middle of the range. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 100, high: 104, low: 96, close: 98 },
      { open: 98, high: 102, low: 94, close: 100 },
      { open: 100, high: 106, low: 98, close: 104 },
      { open: 104, high: 105, low: 90, close: 92 },
      { open: 92, high: 96, low: 88, close: 95 },
    ],
    currentPrice: 95,
    entryDefault: 95,
    stopLossDefault: 86,
    takeProfitDefault: 102,
    entryRange: { min: 92, max: 97 },
    stopLossRange: { min: 84, max: 87 },
    takeProfitRange: { min: 98, max: 106 },
    sliderMin: 75,
    sliderMax: 115,
    sliderStep: 0.5,
    explain:
      "Entry near 92-97 buys the reversal off the extreme, not the falling knife itself. The stop goes just beyond the actual extreme (84-87) — if 88 gets taken out decisively, the range read is wrong. Notice the target (98-106, the range's middle) is smaller than a trend trade's target: mean-reversion trades often take a modest, high-probability payout back to \"average\" rather than a big one — the edge comes from doing this often at good prices, not from a huge single win.",
  },
  {
    id: "strategy-10",
    skillId: "strategy",
    title: "Size a range-high reversion short",
    type: "build-order",
    scenario:
      "BTC has been ranging between 400 support and 460 resistance for several weeks. It just spiked up to 468, well beyond resistance, and is starting to fade. You want to sell this mean-reversion fade back toward the middle of the range. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 420, high: 430, low: 415, close: 425 },
      { open: 425, high: 440, low: 420, close: 435 },
      { open: 435, high: 455, low: 430, close: 450 },
      { open: 450, high: 468, low: 448, close: 465 },
      { open: 465, high: 467, low: 452, close: 455 },
    ],
    currentPrice: 455,
    entryDefault: 455,
    stopLossDefault: 471,
    takeProfitDefault: 432,
    entryRange: { min: 450, max: 460 },
    stopLossRange: { min: 469, max: 474 },
    takeProfitRange: { min: 425, max: 438 },
    sliderMin: 395,
    sliderMax: 480,
    sliderStep: 1,
    explain:
      "Entry near 450-460 sells the fade, not the very top of the spike. The stop sits just beyond the extreme at 468 (469-474) — a decisive break higher means the range has failed, not just stretched. The target (425-438) is the range's middle, the mean-reversion trade's natural destination — not the far side of the range, which would be betting on a full trend reversal instead.",
  },
  {
    id: "strategy-11",
    skillId: "strategy",
    title: "Spot a breakout setup",
    type: "signal-spot",
    prompt:
      "BTC consolidated under 130 resistance for several candles, then broke sharply above it with a strong, high-volume close at 137. Which strategy does this setup call for?",
    candles: [
      { open: 120, high: 128, low: 118, close: 124 },
      { open: 124, high: 129, low: 122, close: 126 },
      { open: 126, high: 130, low: 123, close: 127 },
      { open: 127, high: 129, low: 124, close: 126 },
      { open: 126, high: 138, low: 125, close: 137 },
    ],
    options: [
      "Breakout trading — buy the break of resistance, expecting continuation higher",
      "Mean-reversion — sell into the breakout expecting an immediate fade",
      "Trend-following — wait for a pullback to a moving average first",
    ],
    correctIndex: 0,
    explain:
      "Breakout trading is a third strategy family alongside trend-following and mean-reversion: buy a level breaking decisively, on strong participation, on the expectation that price continues in the direction of the break rather than reverting or waiting for a pullback.",
  },
  {
    id: "strategy-12",
    skillId: "strategy",
    title: "The classic fakeout",
    type: "signal-spot",
    prompt:
      "BTC broke above 130 resistance to 133 — but the very next candle reversed hard, closing back below 130. What just happened?",
    candles: [
      { open: 120, high: 128, low: 118, close: 124 },
      { open: 124, high: 129, low: 122, close: 126 },
      { open: 126, high: 133, low: 125, close: 132 },
      { open: 132, high: 134, low: 122, close: 124 },
    ],
    options: [
      "A textbook, low-risk breakout that will keep extending",
      "A fakeout — price broke the level then immediately reversed, trapping breakout buyers above the old resistance",
      "Confirmation that the breakout is now guaranteed to continue",
    ],
    correctIndex: 1,
    explain:
      "This is the classic breakout risk: price pokes above a level, triggers breakout buyers, then reverses back inside the range within a candle or two — a fakeout. It's why breakout traders watch for a decisive close and real participation, not just a brief poke above the line.",
  },
  {
    id: "strategy-13",
    skillId: "strategy",
    title: "Size a breakout long",
    type: "build-order",
    scenario:
      "BTC consolidated between 118 and 130 for over a week, then broke out above 130 resistance on strong volume, closing at 137. You want to buy the breakout. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 120, high: 128, low: 118, close: 124 },
      { open: 124, high: 129, low: 122, close: 126 },
      { open: 126, high: 130, low: 123, close: 127 },
      { open: 127, high: 129, low: 124, close: 126 },
      { open: 126, high: 138, low: 125, close: 137 },
    ],
    currentPrice: 137,
    entryDefault: 136,
    stopLossDefault: 126,
    takeProfitDefault: 152,
    entryRange: { min: 132, max: 139 },
    stopLossRange: { min: 122, max: 128 },
    takeProfitRange: { min: 146, max: 160 },
    sliderMin: 110,
    sliderMax: 170,
    sliderStep: 0.5,
    explain:
      "Entry near the breakout candle (132-139) confirms the move rather than pre-empting it. The stop goes back inside the prior range (122-128) — below the old resistance-turned-support — so a fakeout back into the range gets you out before it costs much. The target (146-160) uses a simple measured move: the 12-point range height (130-118) projected up from the breakout level.",
  },
  {
    id: "strategy-14",
    skillId: "strategy",
    title: "Size a breakdown short",
    type: "build-order",
    scenario:
      "BTC consolidated between 250 and 280 for two weeks, then broke down below 250 support on strong volume, closing at 238. You want to short the breakdown. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 265, high: 272, low: 258, close: 262 },
      { open: 262, high: 268, low: 255, close: 258 },
      { open: 258, high: 262, low: 250, close: 253 },
      { open: 253, high: 256, low: 248, close: 250 },
      { open: 250, high: 251, low: 236, close: 238 },
    ],
    currentPrice: 238,
    entryDefault: 239,
    stopLossDefault: 253,
    takeProfitDefault: 218,
    entryRange: { min: 234, max: 242 },
    stopLossRange: { min: 250, max: 256 },
    takeProfitRange: { min: 206, max: 224 },
    sliderMin: 190,
    sliderMax: 290,
    sliderStep: 1,
    explain:
      "Mirror image of the breakout long: entry near 234-242 confirms the breakdown. The stop sits back inside the prior range (250-256), above the old support-turned-resistance — a reclaim back above there means the breakdown likely failed. The target (206-224) again uses a measured move: the 30-point range height (280-250) projected down from the breakdown level.",
  },
  {
    id: "strategy-15",
    skillId: "strategy",
    title: "Trend struggles in a range",
    type: "signal-spot",
    prompt:
      "BTC has been oscillating between roughly 90 and 110 for weeks, respecting both boundaries repeatedly with no breakout. Which approach tends to work better here?",
    candles: [
      { open: 100, high: 110, low: 98, close: 102 },
      { open: 102, high: 108, low: 91, close: 94 },
      { open: 94, high: 104, low: 90, close: 100 },
      { open: 100, high: 109, low: 97, close: 106 },
      { open: 106, high: 108, low: 92, close: 95 },
      { open: 95, high: 103, low: 90, close: 99 },
    ],
    options: [
      "Trend-following — buy strength and hold for a big directional move",
      "A range strategy — buy near support (90), sell near resistance (110)",
      "Breakout trading — buy any move above 100",
    ],
    correctIndex: 1,
    explain:
      "Trend-following needs a sustained directional move to pay off, and this market isn't giving one — every push toward a boundary reverses. A range strategy fits what's actually happening: fade the extremes, buying near support and selling near resistance, until the range actually breaks.",
  },
  {
    id: "strategy-16",
    skillId: "strategy",
    title: "Match strategy to market",
    type: "signal-spot",
    prompt:
      "BTC has been grinding steadily higher for over a month, printing higher highs and higher lows with only shallow pullbacks before continuing up. Which strategy family best fits this market condition?",
    candles: [
      { open: 100, high: 104, low: 99, close: 103 },
      { open: 103, high: 107, low: 102, close: 106 },
      { open: 106, high: 108, low: 104, close: 105 },
      { open: 105, high: 110, low: 104, close: 109 },
      { open: 109, high: 113, low: 108, close: 112 },
      { open: 112, high: 116, low: 111, close: 115 },
    ],
    options: [
      "Trend-following — the market is already showing a clear, sustained direction",
      "Mean-reversion — the higher price climbs, the more overdue a snap-back becomes",
      "Range trading — buy support, sell resistance",
    ],
    correctIndex: 0,
    explain:
      "The strategy has to match the market, not the other way around. A market grinding steadily higher with shallow pullbacks and no sign of exhaustion is exactly the condition trend-following is built for — fading it on the assumption it's \"overdue\" to reverse is fighting clear evidence of continuation.",
  },
  {
    id: "strategy-17",
    skillId: "strategy",
    title: "The cost of strategy hopping",
    type: "signal-spot",
    prompt:
      "After two losing mean-reversion trades in a row, a trader abandons that approach and switches to trend-following for the next trade — then switches back to mean-reversion after that trend-following trade also loses. What's the risk with this pattern, known as \"strategy hopping\"?",
    candles: [
      { open: 100, high: 103, low: 98, close: 99 },
      { open: 99, high: 101, low: 96, close: 100 },
      { open: 100, high: 104, low: 98, close: 101 },
      { open: 101, high: 102, low: 97, close: 98 },
      { open: 98, high: 100, low: 95, close: 99 },
    ],
    options: [
      "It's smart risk management — always switch away from whatever just lost",
      "It undermines edge — every real strategy has losing streaks, and abandoning one before it's had a chance to play out means never staying with any approach long enough to realize its actual edge",
      "There's no real risk — switching strategies has no effect on results",
    ],
    correctIndex: 1,
    explain:
      "A strategy's edge shows up over a series of trades, not any single one — even a genuinely good approach loses regularly. Jumping to a different strategy after every loss means judging each one on far too small a sample, and guarantees you're never actually trading the strategy long enough to find out if it works.",
  },
  {
    id: "strategy-18",
    skillId: "strategy",
    title: "Synthesis: size the setup",
    type: "build-order",
    scenario:
      "BTC broke out above 500 resistance a week ago and has trended steadily higher since, printing higher highs and higher lows. It just pulled back to the rising 20-period average near 538 after peaking at 560, and is showing the first green candle back up. Given the established trend since the breakout, this calls for a trend-following pullback entry, not a mean-reversion fade. Set your entry, stop-loss, and take-profit.",
    candles: [
      { open: 500, high: 520, low: 498, close: 518 },
      { open: 518, high: 540, low: 515, close: 538 },
      { open: 538, high: 560, low: 536, close: 555 },
      { open: 555, high: 557, low: 540, close: 543 },
      { open: 543, high: 544, low: 535, close: 538 },
      { open: 538, high: 547, low: 537, close: 546 },
    ],
    currentPrice: 546,
    entryDefault: 546,
    stopLossDefault: 531,
    takeProfitDefault: 575,
    entryRange: { min: 542, max: 552 },
    stopLossRange: { min: 528, max: 534 },
    takeProfitRange: { min: 568, max: 588 },
    sliderMin: 495,
    sliderMax: 600,
    sliderStep: 1,
    explain:
      "The breakout above 500 established the trend; the pullback to the rising average is the trend-following entry, not a reason to fade back down. Entry near 542-552 buys the reversal off the pullback low. The stop belongs just under that pullback low near 535 (528-534) — if it breaks, the trend read is wrong. The target (568-588) is sized beyond the prior peak of 560 for the trend to keep extending, roughly 1.5-2x the risk taken — the same discipline used throughout this skill, applied to a setup you had to correctly identify first.",
  },
];
