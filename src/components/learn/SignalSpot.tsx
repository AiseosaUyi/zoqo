"use client";
import * as React from "react";
import { Button, Progress } from "@/components/ui";
import { useAcademy } from "@/lib/academy";
import { Heart, X, Check } from "lucide-react";
import { PatternChart, type Candle } from "./PatternChart";

interface Question {
  id: string;
  prompt: string;
  candles: Candle[];
  options: string[];
  correctIndex: number;
  explain: string;
}

/** The one lesson id this pass ships — Foundations' skill-tree row tracks
 *  completion against this exact string (see learn/page.tsx). Exported so
 *  that check isn't a magic string duplicated in two files. */
export const SIGNAL_SPOT_LESSON_ID = "signal-spot-1";

// Foundations' full 8-question lesson — chart-reading basics: candle
// anatomy, trend direction, support/resistance, and simple reversal shapes.
// Content production for the rest of the ~90-lesson curriculum is scoped in
// TERMINAL_SPEC.md §6 and left for a future pass (see CLAUDE.md/handoff).
const QUESTIONS: Question[] = [
  {
    id: "q1",
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
    id: "q2",
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
    id: "q3",
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
    explain:
      "A price floor that repeatedly holds is support — the level where buying pressure has, so far, outweighed selling.",
  },
  {
    id: "q4",
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
    id: "q5",
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
    id: "q6",
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
    explain:
      "A price ceiling that repeatedly rejects rallies is resistance — the level where selling pressure has, so far, outweighed buying.",
  },
  {
    id: "q7",
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
    id: "q8",
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
    explain: "Lower highs + lower lows, repeated, is the textbook definition of a downtrend — the mirror image of q2.",
  },
];

export function SignalSpot({ onDone }: { onDone?: () => void }) {
  const { hearts, maxHearts, loseHeart, completeLesson } = useAcademy();
  const [i, setI] = React.useState(0);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [xpEarned, setXpEarned] = React.useState(0);

  const q = QUESTIONS[i];
  const done = i >= QUESTIONS.length || hearts <= 0;

  const pick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === q.correctIndex) setXpEarned((x) => x + 10);
    else loseHeart();
  };

  const next = () => {
    if (i + 1 >= QUESTIONS.length) {
      completeLesson(SIGNAL_SPOT_LESSON_ID, xpEarned);
      setI(QUESTIONS.length);
      onDone?.();
    } else {
      setI((v) => v + 1);
      setPicked(null);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        {hearts <= 0 ? (
          <>
            <div className="text-[18px] font-bold text-ink">Out of hearts</div>
            <p className="max-w-xs text-[13px] text-sub">
              Hearts refill over time — come back soon, or review what tripped you up.
            </p>
          </>
        ) : (
          <>
            <div className="text-[18px] font-bold text-ink">Lesson complete — +{xpEarned} XP</div>
            <p className="text-[13px] text-sub">Nice work spotting the signals.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Progress value={(i / QUESTIONS.length) * 100} color="brand" className="mr-4 flex-1" />
        <div className="flex items-center gap-1 text-red-500">
          {Array.from({ length: maxHearts }).map((_, h) => (
            <Heart key={h} size={16} fill={h < hearts ? "currentColor" : "none"} className={h < hearts ? "" : "text-gray-300"} />
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-muted">
        <PatternChart candles={q.candles} />
      </div>

      <div className="text-[15px] font-semibold text-ink">{q.prompt}</div>

      <div className="flex flex-col gap-2">
        {q.options.map((opt, idx) => {
          const isCorrect = idx === q.correctIndex;
          const isPicked = idx === picked;
          const showState = picked !== null;
          return (
            <button
              key={idx}
              onClick={() => pick(idx)}
              disabled={showState}
              className={`flex items-center justify-between rounded-chip border px-4 py-3 text-left text-[14px] font-medium transition-colors ${
                showState && isCorrect
                  ? "border-green-500 bg-green-50 text-green-800"
                  : showState && isPicked
                    ? "border-red-500 bg-red-50 text-red-800"
                    : "border-line hover:bg-gray-50"
              }`}
            >
              {opt}
              {showState && isCorrect && <Check size={16} className="text-green-600" />}
              {showState && isPicked && !isCorrect && <X size={16} className="text-red-600" />}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="rounded-chip bg-purple-50 p-3 text-[13px] text-purple-800">{q.explain}</div>
      )}

      {picked !== null && (
        <Button color="brand" onClick={next} fullWidth>
          Continue
        </Button>
      )}
    </div>
  );
}
