"use client";
import * as React from "react";
import { Button, Progress } from "@/components/ui";
import { useAcademy } from "@/lib/academy";
import { Heart, X, Check } from "lucide-react";

interface Question {
  id: string;
  prompt: string;
  chartDesc: string; // text stand-in for a rendered chart in this pass
  options: string[];
  correctIndex: number;
  explain: string;
}

// A first, small question bank — proves the mechanic. Content production for
// the full curriculum (~90 lessons) is scoped in TERMINAL_SPEC.md §6 and
// left for the handoff.
const QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "Price opens at $100, spikes to $108, sells off hard, and closes at $101 — a long upper wick with a small body near the low. What does this candle suggest?",
    chartDesc: "Small body near the bottom, long wick on top.",
    options: ["Strong continued buying pressure", "Buyers pushed up but sellers took control — possible reversal down", "No meaningful signal"],
    correctIndex: 1,
    explain: "A long upper wick with a small real body (a shooting-star shape) means buyers tried to push price up, but sellers overwhelmed them by the close — often an early warning of a top.",
  },
  {
    id: "q2",
    prompt: "BTC has been making higher highs and higher lows for six candles in a row. A trader says \"the trend is your friend.\" What are they describing?",
    chartDesc: "A steady staircase of higher highs and higher lows.",
    options: ["An uptrend", "A downtrend", "A range-bound market"],
    correctIndex: 0,
    explain: "Higher highs + higher lows, repeated, is the textbook definition of an uptrend — the phrase is a reminder not to fight it.",
  },
  {
    id: "q3",
    prompt: "Price keeps bouncing off $64,000 every time it falls, then retreats. What is $64,000 acting as?",
    chartDesc: "Price touches a level three times and bounces each time.",
    options: ["Resistance", "Support", "A stop-loss"],
    correctIndex: 1,
    explain: "A price floor that repeatedly holds is support — the level where buying pressure has, so far, outweighed selling.",
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
      completeLesson("signal-spot-1", xpEarned);
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

      <div className="rounded-card border border-line bg-muted p-4 text-[13px] text-sub italic">
        {q.chartDesc}
        <div className="mt-1 text-[11px] not-italic text-sub/70">
          (a real chart snippet renders here once wired to TerminalChart — see handoff)
        </div>
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
