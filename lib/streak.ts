/**
 * Streaks.
 *
 * Daily streak: consecutive calendar days (device local time) with at least
 * one task passed. Pure calendar math on "YYYY-MM-DD" strings.
 *
 * Flawless streak: a global, persistent count of consecutive flawless task
 * passes across the whole app. It increments on every clean pass and resets
 * to 0 on any mistake. Unlike the per-lesson combo, it survives across
 * lessons and sessions (stored in progress). At lesson end it multiplies the
 * lesson's total XP via getStreakMultiplier.
 */

export interface StreakInfo {
  lastActiveDate: string | null;
  streakCount: number;
}

/**
 * Flawless-streak XP multiplier (tunable). No bonus below 5, then it ramps:
 * 5 -> 1.1x, 10 -> 1.2x, 20 -> 1.5x, 50+ -> 2.0x.
 */
export function getStreakMultiplier(streak: number): number {
  if (streak < 5) return 1.0;
  if (streak < 10) return 1.1;
  if (streak < 20) return 1.2;
  if (streak < 50) return 1.5;
  return 2.0;
}

/** Format a Date as YYYY-MM-DD in the device's local time zone. */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The calendar day after a YYYY-MM-DD date (DST-proof: pure date math). */
export function nextDay(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

/**
 * Record activity on `todayLocal` (YYYY-MM-DD):
 * - first activity ever, or after a missed day: streak becomes 1
 * - same day again: unchanged
 * - the day right after the last active day: streak + 1
 */
export function recordActiveDay(
  streak: StreakInfo,
  todayLocal: string,
): StreakInfo {
  const { lastActiveDate, streakCount } = streak;
  if (lastActiveDate === todayLocal) return streak;
  if (lastActiveDate !== null && nextDay(lastActiveDate) === todayLocal) {
    return { lastActiveDate: todayLocal, streakCount: streakCount + 1 };
  }
  return { lastActiveDate: todayLocal, streakCount: 1 };
}
