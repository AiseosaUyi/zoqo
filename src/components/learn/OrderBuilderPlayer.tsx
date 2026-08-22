"use client";
import * as React from "react";
import { Check, X } from "lucide-react";
import { Button, Slider } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PatternChart } from "./PatternChart";
import type { OrderBuilderLesson, SafeRange } from "@/lib/lessons/types";
import type { LessonResult } from "./LessonRunner";

function inRange(value: number, range: SafeRange) {
  return value >= range.min && value <= range.max;
}

const fmt = (v: number) => `$${v.toFixed(2)}`;

/** Build the Order mechanic: drag entry/stop-loss/take-profit onto a shown
 *  setup, graded per-field against a "safe range" rather than a single
 *  right/wrong answer — this is deliberately partial-credit (spec §6: teach
 *  risk sizing, not memorization). A heart is only lost if none of the three
 *  fields land in range; 1-2 out of 3 still earns partial XP with no
 *  penalty, matching the mechanic's own framing as coaching, not a test. */
export function OrderBuilderPlayer({
  lesson,
  onFinish,
}: {
  lesson: OrderBuilderLesson;
  onFinish: (result: LessonResult) => void;
}) {
  const [entry, setEntry] = React.useState(lesson.entryDefault);
  const [stopLoss, setStopLoss] = React.useState(lesson.stopLossDefault);
  const [takeProfit, setTakeProfit] = React.useState(lesson.takeProfitDefault);
  const [checked, setChecked] = React.useState(false);

  const entryOk = inRange(entry, lesson.entryRange);
  const stopOk = inRange(stopLoss, lesson.stopLossRange);
  const profitOk = inRange(takeProfit, lesson.takeProfitRange);
  const score = [entryOk, stopOk, profitOk].filter(Boolean).length;
  const correct = score > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[15px] font-semibold text-ink">{lesson.scenario}</div>

      <div className="h-[180px] overflow-hidden rounded-card border border-line bg-muted">
        <PatternChart
          candles={lesson.candles}
          priceLines={[
            { price: entry, color: "#601fff", title: "Entry" },
            { price: stopLoss, color: "#ef4444", title: "Stop" },
            { price: takeProfit, color: "#16a34a", title: "Target" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-line p-3">
        <Slider
          value={entry}
          onChange={setEntry}
          min={lesson.sliderMin}
          max={lesson.sliderMax}
          step={lesson.sliderStep}
          color="brand"
          disabled={checked}
          label="Entry"
          formatValue={fmt}
        />
        <Slider
          value={stopLoss}
          onChange={setStopLoss}
          min={lesson.sliderMin}
          max={lesson.sliderMax}
          step={lesson.sliderStep}
          color="down"
          disabled={checked}
          label="Stop-loss"
          formatValue={fmt}
        />
        <Slider
          value={takeProfit}
          onChange={setTakeProfit}
          min={lesson.sliderMin}
          max={lesson.sliderMax}
          step={lesson.sliderStep}
          color="up"
          disabled={checked}
          label="Take-profit"
          formatValue={fmt}
        />
      </div>

      {!checked ? (
        <Button color="brand" onClick={() => setChecked(true)} fullWidth>
          Check my order
        </Button>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 rounded-card border border-line p-3 text-[13px]">
            <FieldResult label="Entry" ok={entryOk} />
            <FieldResult label="Stop-loss" ok={stopOk} />
            <FieldResult label="Take-profit" ok={profitOk} />
          </div>
          <div
            className={cn(
              "rounded-chip p-3 text-[13px]",
              correct ? "bg-green-50 text-green-800" : "bg-purple-50 text-purple-800",
            )}
          >
            {lesson.explain}
          </div>
          <Button
            color="brand"
            onClick={() => onFinish({ correct, xpEarned: score * 5 })}
            fullWidth
          >
            Continue
          </Button>
        </>
      )}
    </div>
  );
}

function FieldResult({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sub">{label}</span>
      {ok ? (
        <span className="inline-flex items-center gap-1 font-semibold text-green-600">
          <Check size={14} /> In the safe range
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-semibold text-red-500">
          <X size={14} /> Outside the safe range
        </span>
      )}
    </div>
  );
}
