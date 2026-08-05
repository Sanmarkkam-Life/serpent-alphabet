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

/**
 * Daily-streak XP multiplier (tunable). Rewards consistency: no bonus for the
 * first couple of days, then it ramps gently as the habit sticks.
 * 3 -> 1.05x, 7 -> 1.1x, 14 -> 1.15x, 30+ -> 1.25x.
 */
export function getDailyStreakMultiplier(days: number): number {
  if (days < 3) return 1.0;
  if (days < 7) return 1.05;
  if (days < 14) return 1.1;
  if (days < 30) return 1.15;
  return 1.25;
}

export interface StreakMultipliers {
  flawlessMultiplier: number;
  dailyMultiplier: number;
  /** round(baseTotal * flawlessMultiplier * dailyMultiplier). */
  finalTotal: number;
}

/**
 * Combine both streak multipliers over a lesson's base XP total. The two are
 * multiplicative and applied together, then rounded once. When both are 1.0
 * the result equals the base total (no bonus).
 */
export function applyStreakMultipliers(
  baseTotal: number,
  flawlessStreak: number,
  dailyStreakDays: number,
): StreakMultipliers {
  const flawlessMultiplier = getStreakMultiplier(flawlessStreak);
  const dailyMultiplier = getDailyStreakMultiplier(dailyStreakDays);
  const finalTotal = Math.round(
    baseTotal * flawlessMultiplier * dailyMultiplier,
  );
  return { flawlessMultiplier, dailyMultiplier, finalTotal };
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

/** Whole calendar days from `from` to `to` (DST-proof: pure date math). */
export function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86_400_000);
}

export interface DailyRolloverResult {
  streak: StreakInfo;
  /** True when a daily shield absorbed exactly one missed day. */
  dailyShieldUsed: boolean;
}

/**
 * Daily-streak rollover, run when the app opens. A daily shield protects the
 * streak against exactly ONE missed day:
 * - No streak yet (null date or count 0), or no full day missed (gap <= 1):
 *   nothing to do — a same-day or next-day open keeps the streak intact.
 * - Exactly one full day missed (gap === 2) and a shield is owned: spend the
 *   shield and advance the last-active date to the missed day, so the streak
 *   count survives and today (or later) can continue it.
 * - Otherwise (no shield, or more than one day missed for a single shield):
 *   leave it untouched; recordActiveDay resets it naturally on next activity.
 */
export function applyDailyRollover(
  streak: StreakInfo,
  dailyShields: number,
  todayLocal: string,
): DailyRolloverResult {
  const { lastActiveDate, streakCount } = streak;
  if (lastActiveDate === null || streakCount <= 0) {
    return { streak, dailyShieldUsed: false };
  }
  const gap = daysBetween(lastActiveDate, todayLocal);
  if (gap === 2 && dailyShields > 0) {
    return {
      streak: { lastActiveDate: nextDay(lastActiveDate), streakCount },
      dailyShieldUsed: true,
    };
  }
  return { streak, dailyShieldUsed: false };
}
