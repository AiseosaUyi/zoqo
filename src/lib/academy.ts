"use client";
import * as React from "react";

/** Zoqo Academy — the Duolingo-style learning system (TERMINAL_SPEC.md §6).
 *  This is a first, working slice: one skill tree, real hearts/XP/streak
 *  bookkeeping, and one fully-functional lesson type (Signal Spot). The
 *  other lesson types (Pattern Pop, Build the Order, Mock Trade) and the
 *  remaining ~85 lessons the 3-month curriculum needs are designed in the
 *  spec and left for the handoff — see the Claude Code prompt. */

const KEY = "zoqo-academy-v1";
const MAX_HEARTS = 5;
const HEART_REFILL_MS = 30 * 60_000; // one heart back every 30 min

export interface Skill {
  id: string;
  title: string;
  blurb: string;
  lessonCount: number;
}

export const SKILLS: Skill[] = [
  { id: "foundations", title: "Foundations", blurb: "What a market actually is, and how price is set.", lessonCount: 8 },
  { id: "charts", title: "Reading a Chart", blurb: "Candlesticks, timeframes, support & resistance.", lessonCount: 12 },
  { id: "orders", title: "Order Types", blurb: "Market, limit, stop — and when to use each.", lessonCount: 10 },
  { id: "risk", title: "Risk Management", blurb: "Position sizing, stop-losses, never blow up your account.", lessonCount: 14 },
  { id: "indicators", title: "Indicators", blurb: "Moving averages, RSI, volume — signal vs. noise.", lessonCount: 16 },
  { id: "strategy", title: "Strategy Basics", blurb: "Trend-following, mean-reversion, and picking one.", lessonCount: 18 },
  { id: "psychology", title: "Trading Psychology", blurb: "Why the hardest part is never the chart.", lessonCount: 12 },
];

interface AcademyState {
  xp: number;
  hearts: number;
  lastHeartLostAt: number;
  streak: number;
  lastLessonDay: string | null;
  completedLessons: string[];
}

const INITIAL: AcademyState = {
  xp: 0,
  hearts: MAX_HEARTS,
  lastHeartLostAt: 0,
  streak: 0,
  lastLessonDay: null,
  completedLessons: [],
};

export function useAcademy() {
  const [state, setState] = React.useState<AcademyState>(INITIAL);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...INITIAL, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
    loaded.current = true;
  }, []);

  React.useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  // Passive heart refill.
  const heartsAvailable = React.useMemo(() => {
    if (state.hearts >= MAX_HEARTS) return MAX_HEARTS;
    const refilled = Math.floor((Date.now() - state.lastHeartLostAt) / HEART_REFILL_MS);
    return Math.min(MAX_HEARTS, state.hearts + refilled);
  }, [state.hearts, state.lastHeartLostAt]);

  const loseHeart = React.useCallback(() => {
    setState((s) => ({ ...s, hearts: Math.max(0, s.hearts - 1), lastHeartLostAt: Date.now() }));
  }, []);

  const completeLesson = React.useCallback((lessonId: string, xpEarned: number) => {
    setState((s) => {
      const today = new Date().toDateString();
      const streak = s.lastLessonDay === today ? s.streak : s.lastLessonDay ? s.streak + 1 : 1;
      return {
        ...s,
        xp: s.xp + xpEarned,
        streak,
        lastLessonDay: today,
        completedLessons: s.completedLessons.includes(lessonId)
          ? s.completedLessons
          : [...s.completedLessons, lessonId],
      };
    });
  }, []);

  return {
    xp: state.xp,
    hearts: heartsAvailable,
    maxHearts: MAX_HEARTS,
    streak: state.streak,
    completedLessons: state.completedLessons,
    loseHeart,
    completeLesson,
  };
}
