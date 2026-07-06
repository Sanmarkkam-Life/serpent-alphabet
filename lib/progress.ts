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
}

export function defaultProgress(): Progress {
  return {
    completed: [],
    xp: 0,
    streakCount: 0,
    lastActiveDate: null,
    mute: false,
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
  return {
    completed: isStringArray(obj.completed) ? obj.completed : base.completed,
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
  return { ...defaultProgress(), completed };
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
 * A lesson is unlocked when every lesson before it (by order) is complete.
 * `orderedIds` must be the full lesson id list sorted by `order`.
 */
export function isLessonUnlocked(
  progress: Progress,
  orderedIds: readonly string[],
  lessonId: string,
): boolean {
  const index = orderedIds.indexOf(lessonId);
  if (index === -1) return false;
  return orderedIds
    .slice(0, index)
    .every((id) => progress.completed.includes(id));
}
