"use client";
import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Progress, Badge } from "@/components/ui";
import { SKILLS, useAcademy } from "@/lib/academy";
import { LESSONS_BY_SKILL, type Lesson, type SkillId } from "@/lib/lessons";
import { LessonRunner } from "@/components/learn/LessonRunner";
import { AppHeader } from "@/components/trade/AppHeader";
import { Flame, Zap, Lock, Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

function findLessonById(lessonId: string): Lesson | undefined {
  for (const lessons of Object.values(LESSONS_BY_SKILL)) {
    const found = lessons.find((l) => l.id === lessonId);
    if (found) return found;
  }
  return undefined;
}

// Resuming from a Mock Trade lesson's deep-link into /terminal (see
// MockTradePlayer/mockTrade.ts) — the terminal sends the user back here
// with ?resumeLesson=id rather than relying on any in-memory state
// surviving the round trip through a different route. Takes the id as a
// parameter (from useSearchParams(), read in the component) rather than
// parsing window.location.search itself — a real browser test (Playwright)
// found window.location.search lags behind Next.js's router-managed
// useSearchParams() during a client-side transition, which made this
// silently find nothing on the very first render after navigating back
// here (the identical bug, and fix, as TerminalShell's mockLesson handling).
function resolveResumeLesson(resumeId: string | null): Lesson | null {
  return resumeId ? (findLessonById(resumeId) ?? null) : null;
}

/** Zoqo Academy — Duolingo-style trading curriculum (TERMINAL_SPEC.md §6).
 *  The skill tree reads every lesson from `LESSONS_BY_SKILL` (`@/lib/lessons`)
 *  instead of a hardcoded lesson id — a skill with fewer authored lessons
 *  than its own `lessonCount` just shows the remainder as honest
 *  "in development" slots, so the tree is always accurate to what's
 *  actually playable right now, not a promise. */
export default function LearnPage() {
  return (
    <Suspense>
      <LearnPageContent />
    </Suspense>
  );
}

function LearnPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeLessonParam = searchParams.get("resumeLesson");
  const { xp, streak, completedLessons } = useAcademy();
  const [expanded, setExpanded] = React.useState<SkillId | null>(
    () => resolveResumeLesson(resumeLessonParam)?.skillId ?? null,
  );
  const [activeLesson, setActiveLesson] = React.useState<Lesson | null>(() =>
    resolveResumeLesson(resumeLessonParam),
  );

  // Strip ?resumeLesson= from the URL once consumed above, so a refresh
  // doesn't re-trigger the same resume. Navigation only, no local setState,
  // so this effect is exempt from the set-state-in-effect concern.
  React.useEffect(() => {
    if (resumeLessonParam) router.replace("/learn");
  }, [resumeLessonParam, router]);

  return (
    <>
      <AppHeader />
      <div className={cn("mx-auto max-w-3xl px-4 pt-8 lg:pb-8")}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[24px] font-black text-ink">Zoqo Academy</h1>
            <p className="text-[13px] text-sub">Zero to confident in ~3 months. 15 minutes a day.</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
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
            <LessonRunner lesson={activeLesson} onDone={() => setActiveLesson(null)} />
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {SKILLS.map((s) => {
              const lessons = LESSONS_BY_SKILL[s.id as SkillId];
              const doneCount = lessons.filter((l) => completedLessons.includes(l.id)).length;
              const isExpanded = expanded === s.id;
              const hasContent = lessons.length > 0;

              return (
                <Card key={s.id} padding="none" className="overflow-hidden">
                  <button
                    onClick={() => hasContent && setExpanded(isExpanded ? null : (s.id as SkillId))}
                    disabled={!hasContent}
                    className="flex w-full items-center justify-between p-4 text-left disabled:cursor-default"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-ink">{s.title}</span>
                        {doneCount > 0 && (
                          <Badge color="up" variant="soft">
                            {doneCount}/{s.lessonCount} done
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-sub">{s.blurb}</p>
                      <div className="mt-2 max-w-[220px]">
                        <Progress value={(doneCount / s.lessonCount) * 100} size="sm" />
                      </div>
                    </div>
                    {hasContent ? (
                      <span className="ml-4 shrink-0 text-sub">
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    ) : (
                      <div className="ml-4 flex shrink-0 flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-sub">
                          <Lock size={14} /> In development
                        </div>
                        <span className="text-[11px] text-sub/70">{s.lessonCount} lessons planned</span>
                      </div>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 border-t border-line p-3">
                      {Array.from({ length: s.lessonCount }).map((_, i) => {
                        const lesson = lessons[i];
                        const lessonDone = lesson != null && completedLessons.includes(lesson.id);
                        if (!lesson) {
                          return (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-[10px] px-3 py-2.5 text-[13px] text-sub/70"
                            >
                              <span>
                                {i + 1}. Lesson {i + 1}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Lock size={12} /> In development
                              </span>
                            </div>
                          );
                        }
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => setActiveLesson(lesson)}
                            className={cn(
                              "flex items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-gray-50",
                              lessonDone ? "text-ink" : "text-ink",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              {lessonDone ? (
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-100 text-green-600">
                                  <Check size={12} />
                                </span>
                              ) : (
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-600">
                                  {i + 1}
                                </span>
                              )}
                              {lesson.title}
                            </span>
                            <span className="shrink-0 text-[11px] font-semibold text-purple-600">
                              {lessonDone ? "Practice again" : "Start"}
                            </span>
                          </button>
                        );
                      })}
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
