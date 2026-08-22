import type { SignalSpotLesson } from "./types";

/** Order Types (10 lessons) — Signal Spot format throughout: a short price-
 *  action setup plus a stated trader goal, multiple choice on which order
 *  type (or which use of one) fits. Covers market, limit (buy + sell), stop,
 *  and stop-limit orders, in roughly this arc: what each order type is and
 *  guarantees (1-2, 4, 6) -> how to point a limit order the right direction
 *  (3) -> the slippage trade-offs that separate stop from stop-limit (5-6)
 *  -> applying limit orders to real entries/exits (7-8) -> a market-order
 *  pitfall (9) -> a synthesis question across all four types (10). */
export const LESSONS: SignalSpotLesson[] = [
  {
    id: "orders-1",
    skillId: "orders",
    title: "Market orders trade price for speed",
    type: "signal-spot",
    prompt:
      "BTC just broke out above resistance on a huge green candle, now trading at 82. You want in immediately — you're worried that if you wait for a specific price, the move runs away from you while you sit there. Which order type gets you filled right now, even if it costs a little more than 82?",
    candles: [
      { open: 76, high: 77, low: 75, close: 76.5 },
      { open: 76.5, high: 78, low: 76, close: 77.5 },
      { open: 77.5, high: 78.5, low: 77, close: 78 },
      { open: 78, high: 83, low: 77.5, close: 82 },
    ],
    options: [
      "A market order — buy immediately at whatever price is currently available",
      "A limit order set at exactly 82 — wait for that specific price",
      "A stop order that waits for price to fall back to 80 first",
    ],
    correctIndex: 0,
    explain:
      "A market order fills instantly against whatever liquidity is available, which usually means paying a bit more than the last price you saw — that gap is called slippage. You're trading price for certainty of execution. That's the right trade whenever getting in (or out) matters more than getting a specific number, like chasing a live breakout.",
  },
  {
    id: "orders-2",
    skillId: "orders",
    title: "Limit orders guarantee price, not fills",
    type: "signal-spot",
    prompt:
      "BTC is at 95. You want to buy, but only at 90 or better — you're happy to wait, even if it means the trade never happens. You place a limit buy order at 90. What does this order actually guarantee you?",
    candles: [
      { open: 98, high: 99, low: 96, close: 97 },
      { open: 97, high: 98, low: 95, close: 96 },
      { open: 96, high: 97, low: 94, close: 95 },
    ],
    options: [
      "It guarantees you'll only pay 90 or better if it fills — but not that it fills at all",
      "It guarantees an immediate fill at 95, the current price",
      "It guarantees a fill at exactly 90 the moment you place it",
    ],
    correctIndex: 0,
    explain:
      "A limit order only executes at your price or better. If price never drops to 90, your order just sits there, unfilled, for as long as you leave it open. That's the mirror image of a market order: a limit order guarantees the price, never the execution.",
  },
  {
    id: "orders-3",
    skillId: "orders",
    title: "Buy limits below, sell limits above",
    type: "signal-spot",
    prompt:
      "BTC is trading at 110. You want to place two limit orders: one to buy if it dips to 100, and one to sell if it rallies to 120. Where do these two orders belong relative to the current price?",
    candles: [
      { open: 108, high: 112, low: 107, close: 110 },
      { open: 110, high: 113, low: 109, close: 111 },
      { open: 111, high: 112, low: 108, close: 110 },
    ],
    options: [
      "Buy limit below the current price (100), sell limit above it (120)",
      "Buy limit above the current price (120), sell limit below it (100)",
      "Both orders at the current price, 110",
    ],
    correctIndex: 0,
    explain:
      "A buy limit only makes sense below the current price — you're asking for a discount. A sell limit only makes sense above it — you're asking for a premium. Set a limit order on the 'wrong' side of the market (a buy limit above price, say) and it just fills immediately like a market order, defeating the whole point of using a limit.",
  },
  {
    id: "orders-4",
    skillId: "orders",
    title: "Stop orders trigger a market sale",
    type: "signal-spot",
    prompt:
      "You bought BTC at 100 and it's now at 108. You want protection: if price falls back to 95, you want out automatically, without staring at the screen all day. What should you place at 95?",
    candles: [
      { open: 100, high: 102, low: 99, close: 101 },
      { open: 101, high: 104, low: 100, close: 103 },
      { open: 103, high: 106, low: 102, close: 105 },
      { open: 105, high: 109, low: 104, close: 108 },
    ],
    options: [
      "A stop order (stop-loss) at 95 — dormant until price hits 95, then it becomes a market order to sell",
      "A limit order to sell at 95 — will only ever fill at 95 or higher",
      "Nothing — orders can't be placed below the current market price",
    ],
    correctIndex: 0,
    explain:
      "A stop order isn't a live order sitting in the book — it's a trigger. It does nothing until price touches 95, and the instant it does, it fires off as a market order to sell at the next available price. That's exactly what makes it useful for hands-off downside protection: you set it once and walk away.",
  },
  {
    id: "orders-5",
    skillId: "orders",
    title: "Stop-loss slippage in a fast move",
    type: "signal-spot",
    prompt:
      "You have a stop-loss set at 90 on a long position. Bad news breaks and price gaps straight from 95 down to 82 in one violent candle, blowing straight through your stop level. Where does your stop order actually end up filling?",
    candles: [
      { open: 93, high: 96, low: 92, close: 95 },
      { open: 95, high: 96, low: 94, close: 95.2 },
      { open: 95, high: 95, low: 80, close: 82 },
    ],
    options: [
      "Near 82, or wherever price is trading once the order triggers — not at your 90 stop price",
      "Exactly at 90, guaranteed, no matter how fast price is moving",
      "The order is automatically cancelled and never fills",
    ],
    correctIndex: 0,
    explain:
      "A triggered stop order becomes a market order — it doesn't teleport you to your stop price, it sells at whatever the best available price is after triggering. In a gap or a fast crash, that can be well below 90. This is the classic stop-loss slippage risk: the level you picked is where the order wakes up, not where it fills.",
  },
  {
    id: "orders-6",
    skillId: "orders",
    title: "Stop-limit: protection with a catch",
    type: "signal-spot",
    prompt:
      "After getting burned by slippage like in the last scenario, you want more control. This time you place a stop-limit: a stop trigger at 90 with a limit of 88, meaning once triggered it should only sell at 88 or better. Price then gaps straight through both levels, from 95 to 80 in one candle. What's the trade-off you just took on versus a plain stop order?",
    candles: [
      { open: 96, high: 97, low: 95, close: 96 },
      { open: 96, high: 96, low: 94, close: 95 },
      { open: 95, high: 95, low: 78, close: 80 },
    ],
    options: [
      "You're protected from selling far below 88 — but since price gapped past 88 entirely, your order likely never fills, and you're still holding the position",
      "You're guaranteed to be filled at exactly 90, which a plain stop order can't offer",
      "There's no real trade-off — a stop-limit strictly improves on a plain stop with no downside",
    ],
    correctIndex: 0,
    explain:
      "A stop-limit adds a price floor to a stop order: once triggered, it becomes a limit order (only fills at 88 or better), not a market order. That protects you from a terrible fill — but if price gaps straight past your limit, as it just did here, there's no fill at all, and the one job a stop-loss is supposed to do (guarantee an exit) fails exactly when you need it most.",
  },
  {
    id: "orders-7",
    skillId: "orders",
    title: "Buying a bounce off support",
    type: "signal-spot",
    prompt:
      "BTC has bounced off 60 three separate times this week — it's acting as support. Price is now at 68 and drifting back down. Rather than chasing it lower with a market order or nervously watching the chart, you want to buy automatically if it dips to 61, a couple points above that support. What's the right tool?",
    candles: [
      { open: 65, high: 66, low: 60, close: 64 },
      { open: 64, high: 68, low: 60, close: 66 },
      { open: 66, high: 72, low: 60, close: 70 },
      { open: 70, high: 71, low: 67, close: 68 },
    ],
    options: [
      "A buy limit order at 61 — sits dormant and fills automatically at 61 or better, no watching required",
      "A market order right now at 68, to make sure you're in before it possibly bounces",
      "A stop order at 61 — a market order that fires if price falls through that level",
    ],
    correctIndex: 0,
    explain:
      "A buy limit is exactly the tool for 'buy at a good price if it gets there, otherwise don't chase.' A stop order placed below price behaves differently — it's built for triggering on a breakdown (or protecting an existing long), and once triggered it fills as a market order, which can hand you a worse price than 61 in a fast drop. A limit order is the one that respects both your price and your patience.",
  },
  {
    id: "orders-8",
    skillId: "orders",
    title: "Automating your take-profit",
    type: "signal-spot",
    prompt:
      "You bought BTC at 70; it's now at 88. You've got a busy day ahead and won't be watching the chart, but you want to automatically sell if price reaches 95, locking in the gain without babysitting the position. What should you place at 95?",
    candles: [
      { open: 70, high: 73, low: 69, close: 72 },
      { open: 72, high: 76, low: 71, close: 75 },
      { open: 75, high: 80, low: 74, close: 79 },
      { open: 79, high: 84, low: 78, close: 83 },
      { open: 83, high: 89, low: 82, close: 88 },
    ],
    options: [
      "A limit sell order (a take-profit) at 95 — fills automatically at 95 or better once price gets there",
      "A stop order at 95 — waits for price to fall below 95 before selling",
      "Nothing — an order can't be placed above the current market price",
    ],
    correctIndex: 0,
    explain:
      "This is the mirror image of the buy-limit-off-support idea: a limit sell placed above the current price is your take-profit. It sits inactive until price rises to your level, then fills at 95 or better — the automatic version of 'sell if it hits my target,' with none of the babysitting.",
  },
  {
    id: "orders-9",
    skillId: "orders",
    title: "Market orders in thin liquidity",
    type: "signal-spot",
    prompt:
      "It's 3am, volume is thin, and the order book near the current price of 100 only has a handful of small orders resting in it. You want to buy a meaningful amount right now. If you send a market order for the full size, what's likely to happen?",
    candles: [
      { open: 100, high: 103, low: 97, close: 99 },
      { open: 99, high: 104, low: 96, close: 102 },
      { open: 102, high: 106, low: 98, close: 100 },
    ],
    options: [
      "Your order eats through the thin book and fills at a much worse average price than 100 — a limit order would have capped that",
      "Nothing changes — a market order always fills at the exact current price, regardless of liquidity",
      "The order is automatically rejected because volume is too low",
    ],
    correctIndex: 0,
    explain:
      "A market order fills against whatever liquidity is resting in the book, best price first, then progressively worse prices, until your full size is filled. In a thin book that means 'walking the book' and ending up with a much worse average price than you expected — heavy slippage. A limit order caps how bad a fill you're willing to accept, even if it means a slower or partial fill.",
  },
  {
    id: "orders-10",
    skillId: "orders",
    title: "Choosing the right order type",
    type: "signal-spot",
    prompt:
      "BTC is at 75. Your plan: \"I want to buy, but only if it dips to 70 — I don't want to chase it higher, and I'm fine waiting however long it takes.\" Which order type matches this goal exactly?",
    candles: [
      { open: 80, high: 81, low: 77, close: 78 },
      { open: 78, high: 79, low: 75, close: 76 },
      { open: 76, high: 77, low: 74, close: 75 },
    ],
    options: [
      "A limit buy order at 70",
      "A market order right now, at 75",
      "A stop order at 70",
      "A stop-limit order at 70, with a limit of 68",
    ],
    correctIndex: 0,
    explain:
      "The goal has two parts: only buy at 70 (a price condition) and don't chase it higher (no paying above that once filled). A plain limit order does exactly that — fill at 70 or better, or don't fill. A market order ignores the price condition entirely. A stop order placed below price is built for a different job (protecting a long, or entering a breakdown), and once triggered it becomes a market order, which can pay well above 70 if price is moving fast. A stop-limit adds fill risk with no benefit here — there's no gap or slippage concern in a calm dip like this one.",
  },
];
