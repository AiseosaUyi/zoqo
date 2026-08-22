import type { SignalSpotLesson } from "./types";

/** Trading Psychology — why the hardest part of trading is behavioral, not
 *  technical. All 12 lessons are Signal Spot format: a short scenario (with
 *  a chart that visibly matches what's described) and a multiple-choice
 *  question that names and explains the underlying bias. Charts here are
 *  simpler/generic than Foundations' pattern-recognition charts on purpose
 *  — the concept being tested is behavioral, not pattern-specific, so the
 *  candles just need to support the story (a losing trade actually looks
 *  like it's losing, a rally actually looks extended, etc). */
export const LESSONS: SignalSpotLesson[] = [
  {
    id: "psychology-1",
    skillId: "psychology",
    title: "Why losses hurt more",
    type: "signal-spot",
    prompt:
      "You bought at 100. Price has drifted down to 94 — a 6% loss. You tell yourself you'll sell \"once it gets back to breakeven.\" Last month, a different trade went up 6% and you sold it immediately to lock in the win. What explains selling winners fast but holding losers, hoping they recover?",
    candles: [
      { open: 100, high: 101, low: 99, close: 100 },
      { open: 100, high: 100, low: 97, close: 98 },
      { open: 98, high: 98, low: 96, close: 97 },
      { open: 97, high: 97, low: 94, close: 95 },
      { open: 95, high: 96, low: 93, close: 94 },
    ],
    options: [
      "Loss aversion — losses feel roughly twice as painful as an equivalent gain feels good, so you avoid the pain of locking a loss in even when holding is the worse bet",
      "Confirmation bias — you're only reading news that says the price will recover",
      "Overconfidence from a recent winning streak",
    ],
    correctIndex: 0,
    explain:
      "Loss aversion is one of the best-documented findings in behavioral finance (Kahneman & Tversky): people weigh losses roughly 2x more heavily than equivalent gains. In trading this produces the \"disposition effect\" — selling winners too early to bank the good feeling, and holding losers too long to avoid admitting the loss. The fix is mechanical: decide your exit before you enter, so the decision isn't made by how it feels in the moment.",
  },
  {
    id: "psychology-2",
    skillId: "psychology",
    title: "Revenge trading",
    type: "signal-spot",
    prompt:
      "You just got stopped out for a loss. Two minutes later, without re-checking your plan or waiting for a real setup, you enter a new position at twice your normal size on the same asset, determined to \"win it back\" right now. What is this, and why is it dangerous?",
    candles: [
      { open: 100, high: 101, low: 96, close: 97 },
      { open: 97, high: 99, low: 90, close: 91 },
    ],
    options: [
      "Revenge trading — an emotionally driven, oversized trade taken immediately after a loss to recoup it, usually with a weaker setup and worse risk control than your normal process",
      "Averaging down — a planned, disciplined way to improve your average cost basis",
      "Scaling in — a pre-planned method of building a position in stages",
    ],
    correctIndex: 0,
    explain:
      "Revenge trading swaps your process for your emotions: size goes up right when discipline should go up, and the entry is driven by the need to feel okay again, not by an actual setup. It's one of the fastest ways to turn one manageable loss into an account-damaging one. Averaging down and scaling in are both pre-planned; revenge trading is a reaction.",
  },
  {
    id: "psychology-3",
    skillId: "psychology",
    title: "FOMO entries",
    type: "signal-spot",
    prompt:
      "BTC just ripped from 100 to 130 in an hour while you sat in cash. Afraid of missing more upside, you buy at 130 with no plan, no stop level decided, and no clear reason beyond \"it's still going up.\" What's this behavior called?",
    candles: [
      { open: 100, high: 104, low: 99, close: 103 },
      { open: 103, high: 109, low: 102, close: 108 },
      { open: 108, high: 115, low: 107, close: 113 },
      { open: 113, high: 121, low: 112, close: 119 },
      { open: 119, high: 128, low: 118, close: 127 },
      { open: 127, high: 131, low: 125, close: 130 },
    ],
    options: [
      "FOMO (fear of missing out) — buying after a move has already happened, driven by anxiety about missing more gains rather than by analysis or a plan",
      "Breakout trading — entering as price clears a key resistance level with volume confirming it",
      "Trend following — buying a pullback within an already-established uptrend",
    ],
    correctIndex: 0,
    explain:
      "The tell isn't that you bought into strength — it's that there was no plan behind it. Legitimate breakout and trend-following entries have defined criteria (a level, a pullback, a stop) decided in advance. FOMO entries are chasing an extended move purely because it feels like it's leaving without you, which is exactly when a move is most likely to stall or reverse.",
  },
  {
    id: "psychology-4",
    skillId: "psychology",
    title: "Confirmation bias",
    type: "signal-spot",
    prompt:
      "You're long BTC. You read five different analysts: three warn of a pullback, two are bullish. A week later you can only remember the two bullish takes, and you dismissed the other three as \"noise\" at the time. What's happening here?",
    candles: [
      { open: 100, high: 102, low: 98, close: 101 },
      { open: 101, high: 103, low: 99, close: 100 },
      { open: 100, high: 102, low: 97, close: 99 },
      { open: 99, high: 101, low: 98, close: 100 },
      { open: 100, high: 102, low: 99, close: 101 },
    ],
    options: [
      "Confirmation bias — favoring and remembering information that supports a position you already hold, while discounting or forgetting information that contradicts it",
      "Loss aversion — weighing the pain of a loss more heavily than the pleasure of a gain",
      "Anchoring — fixating on the price you originally paid",
    ],
    correctIndex: 0,
    explain:
      "Confirmation bias is dangerous precisely because it doesn't feel like bias from the inside — the bullish takes just felt more \"credible\" to you because you already wanted them to be true. Once you're in a position, you have a built-in incentive to seek out agreement. A useful habit: deliberately seek out the strongest argument against your position before you enter, not after.",
  },
  {
    id: "psychology-5",
    skillId: "psychology",
    title: "The sunk-cost fallacy",
    type: "signal-spot",
    prompt:
      "You bought at 100. It's now at 70 — down 30%. Your reasoning for continuing to hold: \"I've already lost this much, might as well ride it out instead of taking the loss now.\" Is that sound reasoning for what to do from here?",
    candles: [
      { open: 100, high: 101, low: 96, close: 97 },
      { open: 97, high: 98, low: 90, close: 92 },
      { open: 92, high: 93, low: 84, close: 86 },
      { open: 86, high: 87, low: 78, close: 80 },
      { open: 80, high: 82, low: 69, close: 70 },
    ],
    options: [
      "No — this is the sunk-cost fallacy. The 30% already lost is gone either way and shouldn't influence whether holding from here is actually the better decision going forward",
      "Yes — the size of a loss already taken is the most important input into whether to keep holding",
      "Yes — the longer a position has been held at a loss, the more likely it is to recover",
    ],
    correctIndex: 0,
    explain:
      "Sunk costs — money, time, or effort already spent — are gone regardless of what you do next, so a rational decision should only weigh the trade from here forward: is there still a reason to expect this to work, independent of how much you've already lost? \"I've already lost so much\" is not that reason. It's the same bias that keeps people finishing bad meals because they already paid for them.",
  },
  {
    id: "psychology-6",
    skillId: "psychology",
    title: "Overconfidence after a streak",
    type: "signal-spot",
    prompt:
      "You've won your last 6 trades in a row, each risking your normal 1% of account. On trade 7 you risk 8%, skip your usual checklist, and think \"I can't lose right now.\" What's going on?",
    candles: [
      { open: 100, high: 103, low: 99, close: 102 },
      { open: 102, high: 105, low: 101, close: 104 },
      { open: 104, high: 107, low: 103, close: 106 },
      { open: 106, high: 109, low: 105, close: 108 },
      { open: 108, high: 111, low: 107, close: 110 },
      { open: 110, high: 113, low: 109, close: 112 },
      { open: 112, high: 114, low: 92, close: 95 },
    ],
    options: [
      "Overconfidence bias — a hot streak (often partly luck) gets misread as proof of skill, which pushes traders to abandon their sizing rules and process right when discipline matters most",
      "Mean reversion — increasing size after a winning streak is the statistically correct response",
      "Compounding — this is simply how professional traders responsibly scale up their size",
    ],
    correctIndex: 0,
    explain:
      "Winning streaks feel like validation, but they don't distinguish skill from variance — plenty of consecutive wins are luck. Overconfidence shows up as bigger size, skipped checklists, and a sense of invincibility, which is exactly the setup for the streak-ending trade to be the most damaging one. Real position-size increases should come from a deliberate plan, not a feeling.",
  },
  {
    id: "psychology-7",
    skillId: "psychology",
    title: "Moving your stop-loss",
    type: "signal-spot",
    prompt:
      "You entered at 100 with a stop at 95. Price falls to 96, close to stopping you out. Instead of honoring the plan, you move the stop down to 85 \"to give it more room.\" Price keeps falling to 80. What usually happens when a trader moves a stop-loss further away mid-trade instead of sticking to the original plan?",
    candles: [
      { open: 100, high: 101, low: 98, close: 99 },
      { open: 99, high: 100, low: 96, close: 97 },
      { open: 97, high: 98, low: 90, close: 91 },
      { open: 91, high: 92, low: 84, close: 85 },
      { open: 85, high: 86, low: 79, close: 80 },
    ],
    options: [
      "It usually turns a small, planned loss into a much larger one — the stop was moved to avoid being wrong right now, not because anything about the trade's thesis actually changed",
      "It usually saves the trade, since giving more room lets normal volatility play out before reversing",
      "It has no real effect either way, since stop placement doesn't change what the market goes on to do",
    ],
    correctIndex: 0,
    explain:
      "A stop-loss is a pre-commitment to a specific amount of \"I was wrong.\" Moving it after the fact isn't giving the trade room — it's avoiding the discomfort of admitting the loss, funded by risking more capital to postpone that discomfort. The market has no idea where your original stop was; it kept falling because the thesis was wrong, not because 95 was an unlucky level.",
  },
  {
    id: "psychology-8",
    skillId: "psychology",
    title: "Analysis paralysis",
    type: "signal-spot",
    prompt:
      "Your setup checklist is fully met: trend is up, price is sitting right at support, volume is confirming. You still hesitate, pull up three more indicators looking for \"just a bit more confirmation,\" and by the time you're satisfied, the entry has already run away from you. What's this called?",
    candles: [
      { open: 106, high: 107, low: 101, close: 102 },
      { open: 102, high: 103, low: 98, close: 99 },
      { open: 99, high: 100, low: 95, close: 96 },
      { open: 96, high: 100, low: 95, close: 99 },
      { open: 99, high: 108, low: 98, close: 107 },
    ],
    options: [
      "Analysis paralysis — overthinking or endlessly second-guessing a setup that already met your own stated criteria, until the opportunity passes you by",
      "Patience — waiting for additional confirmation beyond your plan always improves a trade's odds",
      "Discipline — a trader should never act until every possible indicator lines up in agreement",
    ],
    correctIndex: 0,
    explain:
      "A checklist only works as a decision tool if you actually act once it's met. Analysis paralysis is what happens when fear of being wrong gets dressed up as \"more research\" — you keep adding conditions after the fact, which isn't rigor, it's avoidance. If a setup meets your own predefined rules, hunting for extra reassurance in the moment usually just costs you the entry.",
  },
  {
    id: "psychology-9",
    skillId: "psychology",
    title: "A loss vs. a mistake",
    type: "signal-spot",
    prompt:
      "Trade A: you followed your plan exactly — right setup, right size, stop respected — and it still lost. Trade B: you skipped your stop-loss and doubled your normal size on a whim, and it also lost. Are these the same kind of loss?",
    candles: [
      { open: 100, high: 101, low: 98, close: 99 },
      { open: 99, high: 100, low: 96, close: 97 },
      { open: 97, high: 98, low: 94, close: 95 },
    ],
    options: [
      "No — Trade A is a disciplined loss: the process was sound and it just didn't work out this time. Trade B is a mistake: you broke your own rules. Treating both as \"just a loss\" leads traders to either blame a good process or excuse a bad one",
      "Yes — a loss is a loss, and the process behind it doesn't change what it means",
      "No — Trade B was actually the better trade, since it would have paid off bigger if it had worked",
    ],
    correctIndex: 0,
    explain:
      "No strategy wins every time — a well-executed trade can still lose, and that's a normal cost of doing business, not evidence the plan is broken. A mistake is different: it's a loss caused by not following your own rules. Conflating the two is a common trap — it makes traders needlessly tinker with a working strategy after a disciplined loss, while letting real rule-breaking slide because \"it was just one trade.\"",
  },
  {
    id: "psychology-10",
    skillId: "psychology",
    title: "Why keep a trading journal",
    type: "signal-spot",
    prompt:
      "After every trade you write down not just the P&L, but why you took it — the setup, your emotional state, whether you followed your own rules. After a few months of entries, you notice you lose money almost every time you re-enter within an hour of a big loss. What did the journal actually give you here?",
    candles: [
      { open: 100, high: 103, low: 98, close: 102 },
      { open: 102, high: 104, low: 95, close: 96 },
      { open: 96, high: 98, low: 88, close: 89 },
      { open: 89, high: 96, low: 88, close: 95 },
      { open: 95, high: 100, low: 93, close: 99 },
    ],
    options: [
      "Visibility into your own repeated behavioral pattern (in this case, revenge trading after a loss) — something a P&L number alone would never show you, which lets you address the actual cause instead of just the outcome",
      "A guarantee of a higher win rate going forward, since the act of writing things down changes market behavior",
      "A replacement for having a risk-management plan in the first place",
    ],
    correctIndex: 0,
    explain:
      "P&L tells you what happened; a journal that records why you took a trade and how you felt is what lets a pattern like \"I trade badly for an hour after a loss\" become visible at all. Once a pattern like that is written down across dozens of trades instead of living as a vague feeling, it becomes something concrete you can build a rule around — e.g., a mandatory 30-minute pause after any stopped-out trade.",
  },
  {
    id: "psychology-11",
    skillId: "psychology",
    title: "Recognizing tilt",
    type: "signal-spot",
    prompt:
      "After a frustrating loss, you take four more trades in the next twenty minutes — no setups, increasing size each time, chasing every small wiggle in price. What is this pattern called, and what's the best response to it?",
    candles: [
      { open: 100, high: 101, low: 95, close: 96 },
      { open: 96, high: 99, low: 92, close: 93 },
      { open: 93, high: 98, low: 89, close: 97 },
      { open: 97, high: 101, low: 85, close: 87 },
      { open: 87, high: 96, low: 80, close: 82 },
    ],
    options: [
      "\"Tilt\" — a string of impulsive, emotionally driven decisions triggered by a prior loss or frustration. The best response is to stop trading and step away, not to try to power through it",
      "A valid scalping strategy — taking many rapid trades in a short window is inherently a sound approach",
      "Diversification — spreading trades across more entries always reduces overall risk",
    ],
    correctIndex: 0,
    explain:
      "Tilt is a poker term that applies directly to trading: an emotional trigger (usually a loss) puts you into a state where decisions are reactive instead of deliberate, and each bad decision makes the next one more likely. Increasing size while decision quality is dropping is the worst possible combination. There's no indicator for tilt — the only reliable fix is recognizing the pattern in yourself and stepping away before it compounds.",
  },
  {
    id: "psychology-12",
    skillId: "psychology",
    title: "A tilt spiral, step by step",
    type: "signal-spot",
    prompt:
      "Walk through this session: you take a full-size trade and it hits your stop for a loss. Instead of stepping away, you immediately re-enter at double size to \"get it back,\" with no new setup. That goes against you too — but instead of honoring your stop this time, you move it further away, telling yourself the market will \"come back.\" It doesn't, and the loss triples. Which biases were driving this session?",
    candles: [
      { open: 100, high: 101, low: 95, close: 96 },
      { open: 96, high: 98, low: 90, close: 91 },
      { open: 91, high: 93, low: 85, close: 86 },
      { open: 86, high: 87, low: 76, close: 78 },
      { open: 78, high: 80, low: 68, close: 70 },
    ],
    options: [
      "Revenge trading (an oversized, undisciplined re-entry right after a loss) compounded by moving the stop-loss away from the plan on the second trade — a classic tilt spiral where one bad decision creates the conditions for the next",
      "Just bad luck — none of these decisions were behavioral, the market was simply unpredictable that session",
      "Sound risk management — increasing size after a loss and giving a losing trade more room are both standard professional techniques",
    ],
    correctIndex: 0,
    explain:
      "This session strings together two biases you've now seen individually: the doubled, no-setup re-entry right after a loss is revenge trading, and refusing to honor the second stop is the same mistake as moving a stop-loss away from price. Neither decision was based on new information about the trade — both were attempts to avoid feeling like the first loss was final. Real risk management is deciding your size and stop before the trade, immune to how the last one felt.",
  },
];
