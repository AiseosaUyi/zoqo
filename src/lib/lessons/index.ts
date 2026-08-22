import type { SkillId, Lesson } from "./types";
import { LESSONS as FOUNDATIONS } from "./foundations";
import { LESSONS as CHARTS } from "./charts";
import { LESSONS as ORDERS } from "./orders";
import { LESSONS as RISK } from "./risk";
import { LESSONS as INDICATORS } from "./indicators";
import { LESSONS as STRATEGY } from "./strategy";
import { LESSONS as PSYCHOLOGY } from "./psychology";

export type { Lesson, SkillId } from "./types";

/** Single source of truth for every Academy lesson, keyed by skill — the
 *  skill tree (`learn/page.tsx`) reads this instead of any hardcoded lesson
 *  id. A skill with fewer authored lessons than its `academy.ts` `lessonCount`
 *  just shows that many "in development" slots — see `learn/page.tsx`. */
export const LESSONS_BY_SKILL: Record<SkillId, Lesson[]> = {
  foundations: FOUNDATIONS,
  charts: CHARTS,
  orders: ORDERS,
  risk: RISK,
  indicators: INDICATORS,
  strategy: STRATEGY,
  psychology: PSYCHOLOGY,
};

export function getLesson(skillId: SkillId, lessonId: string): Lesson | undefined {
  return LESSONS_BY_SKILL[skillId].find((l) => l.id === lessonId);
}
