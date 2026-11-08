/**
 * Spaced repetition for finished letters (pure, unit-tested).
 *
 * A letter comes back for review 1 day after it is learned. Each clean review
 * (no mistakes) pushes it further out: 3 days, 1 week, 2 weeks. A clean review
 * at the last step graduates it: it is mastered and leaves the schedule.
 * A review with any mistake starts the letter over at 1 day.
 *
 * Dates are local calendar days as YYYY-MM-DD, like the daily streak.
 */

/** Days until the next review, by step. Step 0 is set when a letter is learned. */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14] as const;

export interface ReviewEntry {
  /** Index into REVIEW_INTERVALS_DAYS of the interval that set `due`. */
  step: number;
  /** Local date (YYYY-MM-DD) the review becomes due. */
  due: string;
}

/** lessonId -> its next review. Graduated letters are absent. */
export type ReviewSchedule = Record<string, ReviewEntry>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Add whole days to a YYYY-MM-DD date (calendar math, no time zones). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** A letter was just learned: first review tomorrow. */
export function scheduleAfterLearn(
  schedule: ReviewSchedule,
  lessonId: string,
  today: string,
): ReviewSchedule {
  return {
    ...schedule,
    [lessonId]: { step: 0, due: addDays(today, REVIEW_INTERVALS_DAYS[0]) },
  };
}

/**
 * A review run finished. Clean: move one step out (or graduate after the last
 * step). Any mistake: back to step 0. For a letter not on the schedule
 * (graduated, or learned before reviews existed), a clean review changes
 * nothing and a review with mistakes puts it back on the schedule at step 0.
 */
export function scheduleAfterReview(
  schedule: ReviewSchedule,
  lessonId: string,
  today: string,
  clean: boolean,
): ReviewSchedule {
  const entry = schedule[lessonId];
  if (!clean) return scheduleAfterLearn(schedule, lessonId, today);
  if (!entry) return schedule;
  const nextStep = entry.step + 1;
  if (nextStep >= REVIEW_INTERVALS_DAYS.length) {
    const rest = { ...schedule };
    delete rest[lessonId];
    return rest;
  }
  return {
    ...schedule,
    [lessonId]: {
      step: nextStep,
      due: addDays(today, REVIEW_INTERVALS_DAYS[nextStep]),
    },
  };
}

/** Lesson ids due on or before `today`, in path order. */
export function dueLessonIds(
  schedule: ReviewSchedule,
  today: string,
  orderedIds: readonly string[],
): string[] {
  return orderedIds.filter((id) => {
    const entry = schedule[id];
    return entry !== undefined && entry.due <= today;
  });
}

/** Coerce stored JSON into a valid schedule; bad entries are dropped. */
export function normalizeReviewSchedule(raw: unknown): ReviewSchedule {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: ReviewSchedule = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const { step, due } = value as Record<string, unknown>;
    if (
      typeof step === "number" &&
      Number.isInteger(step) &&
      step >= 0 &&
      step < REVIEW_INTERVALS_DAYS.length &&
      typeof due === "string" &&
      DATE_RE.test(due)
    ) {
      out[id] = { step, due };
    }
  }
  return out;
}
