import type { MockTradeLesson } from "./lessons/types";

/** Bridges the Mock Trade lesson (rendered inside /learn) and the real
 *  /terminal route it deep-links into (TERMINAL_SPEC.md §6) via
 *  sessionStorage — the terminal has no idea a lesson exists, and the
 *  Academy has no idea what a "position" is, so a lesson-specific field on
 *  either provider would leak concerns across the app's one hard boundary
 *  (prediction market / terminal / Academy are three independent domains).
 *  sessionStorage (not localStorage) because a pending mock trade is a
 *  same-tab, same-session handoff — it shouldn't survive a closed tab or
 *  leak into a different browsing session. */

const PENDING_KEY = "zoqo-mocktrade-pending-v1";
const RESULT_KEY = "zoqo-mocktrade-result-v1";

export interface MockTradePending {
  lessonId: string;
  assetId: string;
  instructions: string;
  requiredSide: "long" | "short";
  sizeUsdRange: { min: number; max: number };
  stopLossPctRange: { min: number; max: number };
  takeProfitPctRange: { min: number; max: number };
}

export interface MockTradeResult {
  lessonId: string;
  sideOk: boolean;
  sizeOk: boolean;
  slOk: boolean;
  tpOk: boolean;
}

export function pendingFromLesson(lesson: MockTradeLesson): MockTradePending {
  return {
    lessonId: lesson.id,
    assetId: lesson.assetId,
    instructions: lesson.instructions,
    requiredSide: lesson.requiredSide,
    sizeUsdRange: lesson.sizeUsdRange,
    stopLossPctRange: lesson.stopLossPctRange,
    takeProfitPctRange: lesson.takeProfitPctRange,
  };
}

export function setPendingMockTrade(pending: MockTradePending) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // sessionStorage unavailable (private mode, etc.) — the deep-link still
    // navigates, it just won't be able to grade the trade on return.
  }
}

export function getPendingMockTrade(): MockTradePending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as MockTradePending) : null;
  } catch {
    return null;
  }
}

export function clearPendingMockTrade() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

export function setMockTradeResult(result: MockTradeResult) {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
}

/** Reads and consumes (removes) a pending result for this lesson — one-shot
 *  so revisiting the lesson later doesn't replay a stale grade. */
export function consumeMockTradeResult(lessonId: string): MockTradeResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const result = JSON.parse(raw) as MockTradeResult;
    if (result.lessonId !== lessonId) return null;
    sessionStorage.removeItem(RESULT_KEY);
    return result;
  } catch {
    return null;
  }
}
