import { INITIAL_TASK_PLAN } from "./masteryQueue";
import type { TaskType } from "./types";

/**
 * XP engine. Pure functions only; the LessonRunner feeds task outcomes in
 * and persists the totals.
 *
 * Rules:
 * - 10 XP per task passed. The learn screen grants 0 (it always passes).
 * - Combo starts at 1.0x; each consecutive flawless pass adds +0.5x, capped
 *   at 3.0x. Any fail resets it to 1.0x. A task's XP uses the multiplier in
 *   effect when it was passed. Combo resets at lesson start.
 * - Time bonus for trace and recognize only: finishing under par grants up
 *   to +50% of base XP, linearly (0s = +50%, at par = +0%). Never a
 *   penalty; slow is fine.
 * - Task XP = round(base x combo) + timeBonus.
 */

export const BASE_TASK_XP = 10;
export const COMBO_START = 1.0;
export const COMBO_STEP = 0.5;
export const COMBO_MAX = 3.0;

/** Recognize par: a calm five seconds. */
export const RECOGNIZE_PAR_SECONDS = 5;
/** Trace par: 60% of the lesson's trace time limit. */
export const TRACE_PAR_FRACTION = 0.6;
/** Time bonus tops out at +50% of the task's base XP. */
export const TIME_BONUS_MAX_FRACTION = 0.5;

/** Review mode earns half XP (rounded per component). */
export const REVIEW_XP_RATE = 0.5;
/** Test-out awards every standard task at this clean-pass combo. */
export const TEST_OUT_COMBO = 2.0;

export interface TaskXp {
  base: number;
  comboBonus: number;
  timeBonus: number;
  total: number;
}

export function baseXpFor(type: TaskType): number {
  return type === "learn" ? 0 : BASE_TASK_XP;
}

/** Par time in seconds, or null for untimed tasks (learn, pronounce). */
export function parTimeSeconds(
  type: TaskType,
  traceTimeLimit: number,
): number | null {
  if (type === "trace") return traceTimeLimit * TRACE_PAR_FRACTION;
  if (type === "recognize") return RECOGNIZE_PAR_SECONDS;
  return null;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Bonus XP for finishing a timed task under par. 0 when the task type is
 * untimed, when no elapsed time was measured, or when over par.
 */
export function timeBonusXp(
  type: TaskType,
  elapsedSeconds: number | null,
  traceTimeLimit: number,
): number {
  const par = parTimeSeconds(type, traceTimeLimit);
  const base = baseXpFor(type);
  if (par === null || par <= 0 || base === 0 || elapsedSeconds === null) {
    return 0;
  }
  const headroom = clamp01((par - elapsedSeconds) / par);
  return Math.round(TIME_BONUS_MAX_FRACTION * base * headroom);
}

export function comboAfterPass(combo: number): number {
  return Math.min(COMBO_MAX, combo + COMBO_STEP);
}

export function comboAfterFail(): number {
  return COMBO_START;
}

/** XP for one passed task, given the combo in effect when it was passed. */
export function taskXp(
  type: TaskType,
  combo: number,
  elapsedSeconds: number | null,
  traceTimeLimit: number,
): TaskXp {
  const base = baseXpFor(type);
  const comboTotal = Math.round(base * combo);
  const timeBonus = timeBonusXp(type, elapsedSeconds, traceTimeLimit);
  return {
    base,
    comboBonus: comboTotal - base,
    timeBonus,
    total: comboTotal + timeBonus,
  };
}

/** Scale a task's XP (review mode: 0.5). Each part rounded, total = sum. */
export function scaleTaskXp(xp: TaskXp, rate: number): TaskXp {
  const base = Math.round(xp.base * rate);
  const comboBonus = Math.round(xp.comboBonus * rate);
  const timeBonus = Math.round(xp.timeBonus * rate);
  return { base, comboBonus, timeBonus, total: base + comboBonus + timeBonus };
}

export function addTaskXp(a: TaskXp, b: TaskXp): TaskXp {
  return {
    base: a.base + b.base,
    comboBonus: a.comboBonus + b.comboBonus,
    timeBonus: a.timeBonus + b.timeBonus,
    total: a.total + b.total,
  };
}

export const ZERO_XP: TaskXp = { base: 0, comboBonus: 0, timeBonus: 0, total: 0 };

/** How many XP-earning tasks a standard lesson has (learn grants 0). */
export function standardXpTaskCount(): number {
  return INITIAL_TASK_PLAN.filter((task) => baseXpFor(task.type) > 0).length;
}

/**
 * Test-out reward: every standard XP task at the clean-pass combo, plus
 * the time bonuses actually earned on the one trace and one recognize
 * performed during the challenge.
 */
export function testOutXp(input: {
  traceElapsedSeconds: number | null;
  recognizeElapsedSeconds: number | null;
  traceTimeLimit: number;
}): TaskXp {
  const tasks = standardXpTaskCount();
  const base = tasks * BASE_TASK_XP;
  const perTaskCombo =
    Math.round(BASE_TASK_XP * TEST_OUT_COMBO) - BASE_TASK_XP;
  const comboBonus = tasks * perTaskCombo;
  const timeBonus =
    timeBonusXp("trace", input.traceElapsedSeconds, input.traceTimeLimit) +
    timeBonusXp(
      "recognize",
      input.recognizeElapsedSeconds,
      input.traceTimeLimit,
    );
  return { base, comboBonus, timeBonus, total: base + comboBonus + timeBonus };
}
