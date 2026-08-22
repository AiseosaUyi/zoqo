"use client";
import * as React from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui";
import { useAcademy } from "@/lib/academy";
import type { Lesson } from "@/lib/lessons/types";
import { SignalSpotPlayer } from "./SignalSpotPlayer";
import { PatternPopPlayer } from "./PatternPopPlayer";
import { OrderBuilderPlayer } from "./OrderBuilderPlayer";

export interface LessonResult {
  correct: boolean;
  xpEarned: number;
}

/** The shared hearts/XP/completion shell every lesson mechanic runs inside —
 *  previously this bookkeeping lived directly in SignalSpot.tsx (back when
 *  one component ran an entire multi-question lesson); now each mechanic is
 *  a "player" that only handles its own attempt + feedback UI and reports a
 *  single `LessonResult` back here, so hearts/XP/`completeLesson` are owned
 *  in exactly one place regardless of which of the 3 mechanics is active. */
export function LessonRunner({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const { hearts, maxHearts, loseHeart, completeLesson } = useAcademy();
  const [result, setResult] = React.useState<LessonResult | null>(null);

  function handleFinish(r: LessonResult) {
    if (!r.correct) loseHeart();
    completeLesson(lesson.id, r.xpEarned);
    setResult(r);
  }

  if (result) {
    const outOfHearts = hearts <= 0;
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        {outOfHearts ? (
          <>
            <div className="text-[18px] font-bold text-ink">Out of hearts</div>
            <p className="max-w-xs text-[13px] text-sub">
              Hearts refill over time — come back soon, or review what tripped you up above.
            </p>
          </>
        ) : (
          <>
            <div className="text-[18px] font-bold text-ink">
              {result.xpEarned > 0 ? `Lesson complete — +${result.xpEarned} XP` : "Lesson logged"}
            </div>
            <p className="max-w-xs text-[13px] text-sub">
              {result.correct ? "Nice work." : "Review the explanation above — you'll see a similar one again soon."}
            </p>
          </>
        )}
        <Button color="brand" onClick={onDone} className="mt-2">
          Back to skill tree
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-1 text-red-500">
        {Array.from({ length: maxHearts }).map((_, h) => (
          <Heart
            key={h}
            size={16}
            fill={h < hearts ? "currentColor" : "none"}
            className={h < hearts ? "" : "text-gray-300"}
          />
        ))}
      </div>

      {lesson.type === "signal-spot" && <SignalSpotPlayer lesson={lesson} onFinish={handleFinish} />}
      {lesson.type === "pattern-pop" && <PatternPopPlayer lesson={lesson} onFinish={handleFinish} />}
      {lesson.type === "build-order" && <OrderBuilderPlayer lesson={lesson} onFinish={handleFinish} />}
    </div>
  );
}
