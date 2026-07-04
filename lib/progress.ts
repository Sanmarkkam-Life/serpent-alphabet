"use client";

/**
 * Learner progress, persisted in localStorage under a versioned key.
 * No backend, no accounts — clearing browser data resets the journey.
 */

export const PROGRESS_KEY = "serpent_progress_v1";

export interface Progress {
  /** Lesson ids that have been fully mastered, in completion order. */
  completed: string[];
}

const EMPTY: Progress = { completed: [] };

function safeParse(raw: string | null): Progress {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { completed?: unknown }).completed) &&
      (parsed as { completed: unknown[] }).completed.every(
        (id) => typeof id === "string",
      )
    ) {
      return { completed: (parsed as { completed: string[] }).completed };
    }
  } catch {
    // Corrupted storage — start fresh rather than crash.
  }
  return EMPTY;
}

export function loadProgress(): Progress {
  if (typeof window === "undefined") return EMPTY;
  try {
    return safeParse(window.localStorage.getItem(PROGRESS_KEY));
  } catch {
    // localStorage can throw in private modes — degrade gracefully.
    return EMPTY;
  }
}

export function saveProgress(progress: Progress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable — the session still works in memory.
  }
}

export function markLessonComplete(lessonId: string): Progress {
  const progress = loadProgress();
  if (progress.completed.includes(lessonId)) return progress;
  const next: Progress = { completed: [...progress.completed, lessonId] };
  saveProgress(next);
  return next;
}

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
