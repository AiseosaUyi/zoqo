"use client";
import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Candle } from "./PatternChart";
import type { PatternPopCandidate, PatternPopLesson } from "@/lib/lessons/types";
import type { LessonResult } from "./LessonRunner";

const FLOAT_DURATION_MS = 7000;

/** A tiny inline-SVG candlestick sparkline — deliberately NOT a
 *  `lightweight-charts` instance. Pattern Pop shows several candidates
 *  floating/animating at once; spinning up a full chart-library instance
 *  per floating candidate would be wasteful, so this is a cheap, static
 *  sparkline that consumes the same `Candle` shape `PatternChart` does. */
function MiniCandles({ candles }: { candles: Candle[] }) {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = Math.max(max - min, 0.0001);
  const W = 80;
  const H = 48;
  const pad = 4;
  const cw = (W - pad * 2) / candles.length;
  const y = (p: number) => H - pad - ((p - min) / range) * (H - pad * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-20" aria-hidden="true">
      {candles.map((c, i) => {
        const cx = pad + cw * i + cw / 2;
        const up = c.close >= c.open;
        const color = up ? "#16a34a" : "#ef4444";
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyBottom = y(Math.min(c.open, c.close));
        return (
          <g key={i}>
            <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={color} strokeWidth={1.5} />
            <rect
              x={cx - cw * 0.28}
              y={bodyTop}
              width={cw * 0.56}
              height={Math.max(bodyBottom - bodyTop, 1)}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Pattern Pop mechanic: candidate patterns float bottom-to-top (the CSS
 *  `.pattern-pop-float` animation in globals.css); tap the one matching
 *  `targetPatternName` before it scrolls off. A wrong tap OR letting the
 *  timer run out (whether or not the correct one visually "floated off" —
 *  reduced-motion users get the same time limit without the animation)
 *  both count as a miss. */
export function PatternPopPlayer({
  lesson,
  onFinish,
}: {
  lesson: PatternPopLesson;
  onFinish: (result: LessonResult) => void;
}) {
  const [tapped, setTapped] = React.useState<string | null>(null);
  const [timedOut, setTimedOut] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    timerRef.current = setTimeout(() => setTimedOut(true), FLOAT_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [lesson.id]);

  const target = lesson.candidates.find((c) => c.isTarget);
  const done = tapped !== null || timedOut;
  const correct = tapped != null && target != null && tapped === target.id;

  function tap(c: PatternPopCandidate) {
    if (done) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setTapped(c.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-[15px] font-semibold text-ink">{lesson.instructions}</div>

      <div className="relative h-[220px] overflow-hidden rounded-card border border-line bg-muted">
        {lesson.candidates.map((c, i) => (
          <button
            key={c.id}
            onClick={() => tap(c)}
            disabled={done}
            className="pattern-pop-float absolute flex flex-col items-center gap-1 rounded-[10px] border border-line bg-surface p-2 shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-1 disabled:pointer-events-none"
            style={{
              left: `${8 + i * (84 / Math.max(lesson.candidates.length - 1, 1))}%`,
              animationDuration: `${FLOAT_DURATION_MS}ms`,
              animationPlayState: done ? "paused" : "running",
            }}
          >
            <MiniCandles candles={c.candles} />
            {done && c.isTarget && <Check size={14} className="text-green-600" />}
            {done && tapped === c.id && !c.isTarget && <X size={14} className="text-red-600" />}
          </button>
        ))}
      </div>

      {done && (
        <div
          className={cn(
            "rounded-chip p-3 text-[13px]",
            correct ? "bg-green-50 text-green-800" : "bg-purple-50 text-purple-800",
          )}
        >
          {correct
            ? `That's the ${lesson.targetPatternName}. `
            : timedOut && tapped === null
              ? `Missed it — the ${lesson.targetPatternName} floated off. `
              : "Not quite. "}
          {lesson.explain}
        </div>
      )}

      {done && (
        <Button color="brand" onClick={() => onFinish({ correct, xpEarned: correct ? 10 : 0 })} fullWidth>
          Continue
        </Button>
      )}
    </div>
  );
}
