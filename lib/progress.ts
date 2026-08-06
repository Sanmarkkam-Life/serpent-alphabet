"use client";

import { applyDailyRollover, recordActiveDay, localDateString } from "./streak";

/**
 * Learner progress, persisted in localStorage under a versioned key.
 * No backend, no accounts; clearing browser data resets the journey.
 *
 * v2 adds gamification fields on top of v1's completed-lesson list.
 * On first load after the upgrade, v1 is migrated into v2 and left in
 * place untouched as a backup. All writes go to v2.
 *
 * v5 adds streak shields and chest-claim tracking. These are additive: they
 * default cleanly on any older payload, so there is NO storage version bump.
 */

export const PROGRESS_KEY = "serpent_progress_v2";
export const LEGACY_PROGRESS_KEY_V1 = "serpent_progress_v1";

/** Each shield type stacks up to this many. */
export const SHIELD_CAP = 3;

export type ShieldType = "flawless" | "daily";

export interface ShieldInventory {
  /** Absorbs one mistake before the flawless streak would reset. */
  flawless: number;
  /** Absorbs one missed day before the daily streak would reset. */
  daily: number;
}

export interface Progress {
  /** Lesson ids that have been fully mastered, in completion order. */
  completed: string[];
  /** Lifetime XP across lessons, reviews, and test-outs. */
  xp: number;
  /** Consecutive local-calendar days with at least one task passed. */
  streakCount: number;
  /** Last local date (YYYY-MM-DD) with activity, or null. */
  lastActiveDate: string | null;
  /** Mutes feedback SFX only. Never silences reference pronunciation. */
  mute: boolean;
  /**
   * True once "The Soul Letters" intro has been viewed; the first lesson
   * stays locked until then. Additive field: older v2 payloads without it
   * normalize to false, except that anyone with a completed lesson is
   * treated as having seen it (they were never meant to be re-locked).
   */
  introViewed: boolean;
  /**
   * True once the "About Tamil" intro has been viewed; the Soul Letters
   * intro stays locked until then. Additive field: existing users who have
   * already seen Soul Letters or completed a lesson are backfilled as true
   * so they are never re-locked.
   */
  tamilIntroViewed: boolean;
  /**
   * Global, persistent count of consecutive flawless task passes across the
   * whole app. Increments on every clean pass, resets to 0 on any mistake.
   * Distinct from the per-lesson combo. Additive field, defaults to 0.
   */
  flawlessStreak: number;
  /**
   * Consumable streak shields won from treasure chests. Additive v5 field:
   * older payloads without it default to { flawless: 0, daily: 0 }.
   */
  shields: ShieldInventory;
  /**
   * Lesson ids whose treasure chest has already been opened. Each lesson
   * grants a chest exactly once. Additive v5 field, defaults to [].
   */
  chestClaimedLessons: string[];
}

export function defaultProgress(): Progress {
  return {
    completed: [],
    xp: 0,
    streakCount: 0,
    lastActiveDate: null,
    mute: false,
    introViewed: false,
    tamilIntroViewed: false,
    flawlessStreak: 0,
    shields: { flawless: 0, daily: 0 },
    chestClaimedLessons: [],
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Coerce one shield count to an integer within [0, SHIELD_CAP]. */
function normalizeShieldCount(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return Math.min(SHIELD_CAP, value);
  }
  return 0;
}

/** Coerce anything into a valid, capped shield inventory. */
export function normalizeShields(value: unknown): ShieldInventory {
  const obj =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    flawless: normalizeShieldCount(obj.flawless),
    daily: normalizeShieldCount(obj.daily),
  };
}

/**
 * Coerce anything (v2 JSON, garbage, partial objects) into a valid
 * Progress. Unknown or malformed fields fall back to defaults.
 */
export function normalizeProgress(raw: unknown): Progress {
  const base = defaultProgress();
  if (typeof raw !== "object" || raw === null) return base;
  const obj = raw as Record<string, unknown>;
  const completed = isStringArray(obj.completed)
    ? obj.completed
    : base.completed;
  return {
    completed,
    xp:
      typeof obj.xp === "number" && Number.isFinite(obj.xp) && obj.xp >= 0
        ? Math.round(obj.xp)
        : base.xp,
    streakCount:
      typeof obj.streakCount === "number" &&
      Number.isInteger(obj.streakCount) &&
      obj.streakCount >= 0
        ? obj.streakCount
        : base.streakCount,
    lastActiveDate:
      typeof obj.lastActiveDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(obj.lastActiveDate)
        ? obj.lastActiveDate
        : base.lastActiveDate,
    mute: typeof obj.mute === "boolean" ? obj.mute : base.mute,
    // Backfill: anyone who has completed a lesson has seen the beginning.
    introViewed:
      (typeof obj.introViewed === "boolean" && obj.introViewed) ||
      completed.length > 0,
    // Backfill: anyone past the Soul Letters intro (viewed it, or completed a
    // lesson) is treated as having seen the Tamil intro, never re-locked.
    tamilIntroViewed:
      (typeof obj.tamilIntroViewed === "boolean" && obj.tamilIntroViewed) ||
      (typeof obj.introViewed === "boolean" && obj.introViewed) ||
      completed.length > 0,
    flawlessStreak:
      typeof obj.flawlessStreak === "number" &&
      Number.isInteger(obj.flawlessStreak) &&
      obj.flawlessStreak >= 0
        ? obj.flawlessStreak
        : base.flawlessStreak,
    shields: normalizeShields(obj.shields),
    chestClaimedLessons: isStringArray(obj.chestClaimedLessons)
      ? obj.chestClaimedLessons
      : base.chestClaimedLessons,
  };
}

/**
 * Pure v1 -> v2 migration: carry the completed lessons (which carry the
 * unlocks with them), initialize the new fields.
 */
export function migrateV1ToV2(v1: unknown): Progress {
  const completed =
    typeof v1 === "object" &&
    v1 !== null &&
    isStringArray((v1 as { completed?: unknown }).completed)
      ? (v1 as { completed: string[] }).completed
      : [];
  // Normalize applies the intro backfill for users with completed lessons.
  return normalizeProgress({ ...defaultProgress(), completed });
}

function readKey(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return defaultProgress();
  try {
    const v2 = readKey(PROGRESS_KEY);
    if (v2 !== null) return normalizeProgress(v2);
    const v1 = readKey(LEGACY_PROGRESS_KEY_V1);
    if (v1 !== null) {
      const migrated = migrateV1ToV2(v1);
      saveProgress(migrated); // v1 stays untouched as a backup
      return migrated;
    }
  } catch {
    // localStorage can throw in private modes; degrade gracefully.
  }
  return defaultProgress();
}

export function saveProgress(progress: Progress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable; the session still works in memory.
  }
}

/* ------------------------------------------------------------------ */
/* Pure state transitions (shields + chests) — unit-testable, no I/O   */
/* ------------------------------------------------------------------ */

/** Add one shield of `type`, honouring the stack cap. */
export function grantShield(
  shields: ShieldInventory,
  type: ShieldType,
): { shields: ShieldInventory; added: boolean } {
  if (shields[type] >= SHIELD_CAP) return { shields, added: false };
  return { shields: { ...shields, [type]: shields[type] + 1 }, added: true };
}

export type ChestClaimResult = "added" | "max" | "already";

/**
 * Open a lesson's chest and take one shield. A lesson's chest can be opened
 * only once ("already"); a pick at the stack cap still claims the chest but
 * grants nothing ("max").
 */
export function applyChestClaim(
  progress: Progress,
  lessonId: string,
  choice: ShieldType,
): { progress: Progress; result: ChestClaimResult } {
  if (progress.chestClaimedLessons.includes(lessonId)) {
    return { progress, result: "already" };
  }
  const { shields, added } = grantShield(progress.shields, choice);
  const next: Progress = {
    ...progress,
    shields,
    chestClaimedLessons: [...progress.chestClaimedLessons, lessonId],
  };
  return { progress: next, result: added ? "added" : "max" };
}

/**
 * Resolve a mistake against the flawless streak. A flawless shield absorbs
 * the hit (streak preserved, shield spent); otherwise the streak resets to 0.
 */
export function resolveFlawlessMistake(
  shields: ShieldInventory,
  flawlessStreak: number,
): { shields: ShieldInventory; flawlessStreak: number; shieldUsed: boolean } {
  if (shields.flawless > 0) {
    return {
      shields: { ...shields, flawless: shields.flawless - 1 },
      flawlessStreak,
      shieldUsed: true,
    };
  }
  return { shields, flawlessStreak: 0, shieldUsed: false };
}

/* ------------------------------------------------------------------ */
/* Mutations (load-modify-save)                                        */
/* ------------------------------------------------------------------ */

export function markLessonComplete(lessonId: string): Progress {
  const progress = loadProgress();
  if (progress.completed.includes(lessonId)) return progress;
  const next: Progress = {
    ...progress,
    completed: [...progress.completed, lessonId],
  };
  saveProgress(next);
  return next;
}

/** Add earned XP to the lifetime total. Returns the updated progress. */
export function addXp(amount: number): Progress {
  const progress = loadProgress();
  if (!Number.isFinite(amount) || amount <= 0) return progress;
  const next: Progress = { ...progress, xp: progress.xp + Math.round(amount) };
  saveProgress(next);
  return next;
}

/** Record "at least one task passed today" for the daily streak. */
export function recordTaskActivity(now: Date = new Date()): Progress {
  const progress = loadProgress();
  const today = localDateString(now);
  const updated = recordActiveDay(
    {
      lastActiveDate: progress.lastActiveDate,
      streakCount: progress.streakCount,
    },
    today,
  );
  if (
    updated.lastActiveDate === progress.lastActiveDate &&
    updated.streakCount === progress.streakCount
  ) {
    return progress;
  }
  const next: Progress = {
    ...progress,
    lastActiveDate: updated.lastActiveDate,
    streakCount: updated.streakCount,
  };
  saveProgress(next);
  return next;
}

/** Mark "The Soul Letters" intro as viewed; unlocks the first lesson. */
export function markIntroViewed(): Progress {
  const progress = loadProgress();
  if (progress.introViewed) return progress;
  const next: Progress = { ...progress, introViewed: true };
  saveProgress(next);
  return next;
}

/** Mark the "About Tamil" intro as viewed; unlocks the Soul Letters intro. */
export function markTamilIntroViewed(): Progress {
  const progress = loadProgress();
  if (progress.tamilIntroViewed) return progress;
  const next: Progress = { ...progress, tamilIntroViewed: true };
  saveProgress(next);
  return next;
}

/** Increment the global flawless streak after a clean task pass. */
export function bumpFlawlessStreak(): Progress {
  const progress = loadProgress();
  const next: Progress = {
    ...progress,
    flawlessStreak: progress.flawlessStreak + 1,
  };
  saveProgress(next);
  return next;
}

/** Reset the flawless streak to 0 after any mistake. */
export function resetFlawlessStreak(): Progress {
  const progress = loadProgress();
  if (progress.flawlessStreak === 0) return progress;
  const next: Progress = { ...progress, flawlessStreak: 0 };
  saveProgress(next);
  return next;
}

/**
 * Spend one flawless shield if any are owned. Returns whether a shield was
 * actually consumed so the caller can choose between "streak saved" and the
 * normal reset.
 */
export function consumeFlawlessShield(): { progress: Progress; used: boolean } {
  const progress = loadProgress();
  if (progress.shields.flawless <= 0) return { progress, used: false };
  const next: Progress = {
    ...progress,
    shields: { ...progress.shields, flawless: progress.shields.flawless - 1 },
  };
  saveProgress(next);
  return { progress: next, used: true };
}

/**
 * Open a lesson's treasure chest and bank the chosen shield. Idempotent per
 * lesson: a second call for the same lesson is a no-op ("already").
 */
export function claimChest(
  lessonId: string,
  choice: ShieldType,
): { progress: Progress; result: ChestClaimResult } {
  const progress = loadProgress();
  const { progress: next, result } = applyChestClaim(progress, lessonId, choice);
  if (result !== "already") saveProgress(next);
  return { progress: next, result };
}

/**
 * Run the daily-streak rollover on app open. If a full day was missed and a
 * daily shield is owned, spend it to keep the 🔥 streak alive and report it so
 * the UI can reassure the learner.
 */
export function runDailyRollover(
  now: Date = new Date(),
): { progress: Progress; dailyShieldUsed: boolean } {
  const progress = loadProgress();
  const today = localDateString(now);
  const { streak, dailyShieldUsed } = applyDailyRollover(
    { lastActiveDate: progress.lastActiveDate, streakCount: progress.streakCount },
    progress.shields.daily,
    today,
  );
  if (!dailyShieldUsed) return { progress, dailyShieldUsed: false };
  const next: Progress = {
    ...progress,
    lastActiveDate: streak.lastActiveDate,
    streakCount: streak.streakCount,
    shields: { ...progress.shields, daily: progress.shields.daily - 1 },
  };
  saveProgress(next);
  return { progress: next, dailyShieldUsed: true };
}

export function setMute(mute: boolean): Progress {
  const progress = loadProgress();
  if (progress.mute === mute) return progress;
  const next: Progress = { ...progress, mute };
  saveProgress(next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function isLessonComplete(progress: Progress, lessonId: string): boolean {
  return progress.completed.includes(lessonId);
}

/** True once this lesson's treasure chest has been opened. */
export function isChestClaimed(progress: Progress, lessonId: string): boolean {
  return progress.chestClaimedLessons.includes(lessonId);
}

/**
 * A lesson is unlocked when the intro has been viewed and every lesson
 * before it (by order) is complete. `orderedIds` must be the full lesson
 * id list sorted by `order`.
 */
export function isLessonUnlocked(
  progress: Progress,
  orderedIds: readonly string[],
  lessonId: string,
): boolean {
  if (!progress.introViewed) return false;
  const index = orderedIds.indexOf(lessonId);
  if (index === -1) return false;
  return orderedIds
    .slice(0, index)
    .every((id) => progress.completed.includes(id));
}
