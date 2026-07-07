"use client";

import { recordActiveDay, localDateString } from "./streak";

/**
 * Learner progress, persisted in localStorage under a versioned key.
 * No backend, no accounts; clearing browser data resets the journey.
 *
 * v2 adds gamification fields on top of v1's completed-lesson list.
 * On first load after the upgrade, v1 is migrated into v2 and left in
 * place untouched as a backup. All writes go to v2.
 */

export const PROGRESS_KEY = "serpent_progress_v2";
export const LEGACY_PROGRESS_KEY_V1 = "serpent_progress_v1";

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
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
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
