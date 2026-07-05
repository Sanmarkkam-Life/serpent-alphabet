/**
 * Daily streak: consecutive calendar days (device local time) with at
 * least one task passed. Pure calendar math on "YYYY-MM-DD" strings; the
 * device's local date enters only through `localDateString(new Date())`.
 * No notifications, no guilt. It's just quietly there.
 */

export interface StreakInfo {
  lastActiveDate: string | null;
  streakCount: number;
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
