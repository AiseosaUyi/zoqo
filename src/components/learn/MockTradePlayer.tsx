"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { ASSET_BY_ID } from "@/lib/assets";
import type { MockTradeLesson } from "@/lib/lessons/types";
import type { LessonResult } from "./LessonRunner";
import {
  pendingFromLesson,
  setPendingMockTrade,
  consumeMockTradeResult,
  type MockTradeResult,
} from "@/lib/mockTrade";

/** Mock Trade: "place this trade on the demo terminal" (TERMINAL_SPEC.md §6)
 *  — the one Academy mechanic that isn't a self-contained mini-game. It
 *  hands off to the real /terminal via sessionStorage (see mockTrade.ts) for
 *  a guided live rep, then reads the graded result back when the user
 *  returns here. Two renders of the same component: "go place the trade" (no
 *  result yet) and "here's how it went" (a result is waiting), same
 *  checked/unchecked split every other player uses. */
export function MockTradePlayer({
  lesson,
  onFinish,
}: {
  lesson: MockTradeLesson;
  onFinish: (result: LessonResult) => void;
}) {
  const router = useRouter();
  const asset = ASSET_BY_ID[lesson.assetId];
  const [result] = React.useState<MockTradeResult | null>(() => consumeMockTradeResult(lesson.id));

  const startTrade = () => {
    setPendingMockTrade(pendingFromLesson(lesson));
    router.push(`/terminal?mockLesson=${encodeURIComponent(lesson.id)}`);
  };

  if (result) {
    const score = [result.sizeOk, result.slOk, result.tpOk].filter(Boolean).length;
    const correct = result.sideOk && score > 0;
    const xpEarned = result.sideOk ? score * 5 : 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="text-[15px] font-semibold text-ink">How your trade graded</div>
        <div className="flex flex-col gap-1.5 rounded-card border border-line p-3 text-[13px]">
          <FieldResult label={`Side: ${lesson.requiredSide}`} ok={result.sideOk} />
          {result.sideOk && (
            <>
              <FieldResult label="Size" ok={result.sizeOk} />
              <FieldResult label="Stop-loss" ok={result.slOk} />
              <FieldResult label="Take-profit" ok={result.tpOk} />
            </>
          )}
        </div>
        <div
          className={cn(
            "rounded-chip p-3 text-[13px]",
            correct ? "bg-green-50 text-green-800" : "bg-purple-50 text-purple-800",
          )}
        >
          {result.sideOk
            ? lesson.explain
            : `That trade went the wrong direction — the setup called for a ${lesson.requiredSide}. ${lesson.explain}`}
        </div>
        <Button color="brand" onClick={() => onFinish({ correct, xpEarned })} fullWidth>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[15px] font-semibold text-ink">{lesson.instructions}</div>
      <div className="flex flex-col gap-1.5 rounded-card border border-line p-3 text-[13px] text-sub">
        <div className="flex justify-between">
          <span>Asset</span>
          <span className="font-semibold text-ink">{asset?.symbol ?? lesson.assetId}</span>
        </div>
        <div className="flex justify-between">
          <span>Direction</span>
          <span className="font-semibold text-ink capitalize">{lesson.requiredSide}</span>
        </div>
        <div className="flex justify-between">
          <span>Size</span>
          <span className="font-semibold text-ink nums">
            ${lesson.sizeUsdRange.min}–${lesson.sizeUsdRange.max}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Stop-loss</span>
          <span className="font-semibold text-ink nums">
            {lesson.stopLossPctRange.min}%–{lesson.stopLossPctRange.max}% away
          </span>
        </div>
        <div className="flex justify-between">
          <span>Take-profit</span>
          <span className="font-semibold text-ink nums">
            {lesson.takeProfitPctRange.min}%–{lesson.takeProfitPctRange.max}% away
          </span>
        </div>
      </div>
      <p className="text-[12px] text-sub">
        This opens the real Terminal with this setup pinned to the top — place the trade there,
        then you&apos;ll be brought back here to see how it graded.
      </p>
      <Button color="brand" onClick={startTrade} fullWidth>
        Open the Terminal <ArrowRight size={14} />
      </Button>
    </div>
  );
}

function FieldResult({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sub capitalize">{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 font-semibold text-green-600">
          <Check size={14} /> Good
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-red-500">
          <X size={14} /> Off
        </span>
      )}
    </div>
  );
}
