"use client";
import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { PatternChart } from "./PatternChart";
import type { SignalSpotLesson } from "@/lib/lessons/types";
import type { LessonResult } from "./LessonRunner";

/** Signal Spot mechanic only — hearts/XP/completion bookkeeping lives in
 *  `LessonRunner` now (this used to own it directly, back when one component
 *  ran an entire 8-question lesson end to end; now each question is its own
 *  lesson, and the same runner shell hosts Pattern Pop and Build the Order
 *  too, so the bookkeeping had to move up a level). */
export function SignalSpotPlayer({
  lesson,
  onFinish,
}: {
  lesson: SignalSpotLesson;
  onFinish: (result: LessonResult) => void;
}) {
  const [picked, setPicked] = React.useState<number | null>(null);

  const pick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
  };

  const correct = picked === lesson.correctIndex;

  return (
    <div className="flex flex-col gap-4">
      <div className="h-[140px] overflow-hidden rounded-card border border-line bg-muted">
        <PatternChart candles={lesson.candles} />
      </div>

      <div className="text-[15px] font-semibold text-ink">{lesson.prompt}</div>

      <div className="flex flex-col gap-2">
        {lesson.options.map((opt, idx) => {
          const isCorrect = idx === lesson.correctIndex;
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
        <div className="rounded-chip bg-purple-50 p-3 text-[13px] text-purple-800">{lesson.explain}</div>
      )}

      {picked !== null && (
        <Button color="brand" onClick={() => onFinish({ correct, xpEarned: correct ? 10 : 0 })} fullWidth>
          Continue
        </Button>
      )}
    </div>
  );
}
