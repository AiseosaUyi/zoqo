"use client";
import * as React from "react";
import { Card, Progress, Badge } from "@/components/ui";
import { SKILLS, useAcademy } from "@/lib/academy";
import { SignalSpot } from "@/components/learn/SignalSpot";
import { AppHeader } from "@/components/trade/AppHeader";
import { Flame, Zap, Lock } from "lucide-react";

/** Zoqo Academy — Duolingo-style trading curriculum (TERMINAL_SPEC.md §6).
 *  Ships one fully working lesson (Signal Spot) inside the first skill so
 *  the mechanic is real, not a mock — the rest of the skill tree is a
 *  content shell pending the ~90-lesson curriculum called out in the spec. */
export default function LearnPage() {
  const { xp, streak, completedLessons } = useAcademy();
  const [activeLesson, setActiveLesson] = React.useState<string | null>(null);

  return (
    <>
      <AppHeader active="learn" />
      <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[24px] font-black text-ink">Zoqo Academy</h1>
          <p className="text-[13px] text-sub">Zero to confident in ~3 months. 15 minutes a day.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-orange-600">
            <Flame size={18} fill="currentColor" />
            <span className="text-[15px] font-bold nums">{streak}</span>
          </div>
          <div className="flex items-center gap-1.5 text-purple-600">
            <Zap size={18} fill="currentColor" />
            <span className="text-[15px] font-bold nums">{xp} XP</span>
          </div>
        </div>
      </div>

      {activeLesson ? (
        <Card className="p-5">
          <button
            onClick={() => setActiveLesson(null)}
            className="mb-4 text-[12px] font-semibold text-sub hover:text-ink"
          >
            ← Back to skill tree
          </button>
          <SignalSpot onDone={() => {}} />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {SKILLS.map((s, idx) => {
            // only Foundations' first lesson is playable in this pass; the
            // rest of the tree is a content shell (see TERMINAL_SPEC.md §6).
            const lessonDone = completedLessons.includes("signal-spot-1") && idx === 0;
            return (
              <Card key={s.id} className="flex items-center justify-between p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-ink">{s.title}</span>
                    {lessonDone && <Badge color="up" variant="soft">1/{s.lessonCount} done</Badge>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-sub">{s.blurb}</p>
                  <div className="mt-2 max-w-[220px]">
                    <Progress value={lessonDone ? (1 / s.lessonCount) * 100 : 0} size="sm" />
                  </div>
                </div>
                {idx === 0 ? (
                  <button
                    onClick={() => setActiveLesson("signal-spot-1")}
                    className="ml-4 rounded-full bg-purple-500 px-4 py-2 text-[12.5px] font-bold text-white hover:bg-purple-600"
                  >
                    {lessonDone ? "Practice again" : "Start"}
                  </button>
                ) : (
                  <div className="ml-4 flex items-center gap-1.5 text-[12px] font-semibold text-sub">
                    <Lock size={14} /> Coming soon
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
