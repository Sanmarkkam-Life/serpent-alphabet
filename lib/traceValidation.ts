import type { NormalizedPoint } from "./types";

/**
 * Pure validators for the author save-trace endpoint. No secrets, no I/O,
 * so they are unit-testable and safe to import anywhere. The server route
 * MUST run every incoming request through these before touching the repo.
 */

/** Lesson ids are lowercase-letters only; this also blocks path traversal. */
const LESSON_ID_RE = /^[a-z]+$/;

/** Sane bounds on a trace path length (author strokes are simplified). */
export const MIN_TRACE_POINTS = 2;
export const MAX_TRACE_POINTS = 2000;

/**
 * Return the id unchanged if it is a safe lesson id (`^[a-z]+$`), else null.
 * Rejects "", "../x", "a/b", "A", "a1", etc. — so it can never escape
 * content/lessons/ when used to build a file path.
 */
export function sanitizeLessonId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  return LESSON_ID_RE.test(id) ? id : null;
}

export type TracePathResult =
  | { ok: true; path: NormalizedPoint[] }
  | { ok: false; reason: string };

/**
 * Validate an incoming trace_path: an array of MIN..MAX `[x, y]` pairs, each
 * coordinate a finite number. Returns a freshly built array on success so
 * callers never persist extra smuggled fields from the request body.
 */
export function validateTracePath(value: unknown): TracePathResult {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "trace_path must be an array" };
  }
  if (value.length < MIN_TRACE_POINTS || value.length > MAX_TRACE_POINTS) {
    return {
      ok: false,
      reason: `trace_path must have ${MIN_TRACE_POINTS}-${MAX_TRACE_POINTS} points (got ${value.length})`,
    };
  }
  const path: NormalizedPoint[] = [];
  for (let i = 0; i < value.length; i++) {
    const point = value[i];
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      return {
        ok: false,
        reason: `point ${i} must be a [number, number] pair of finite numbers`,
      };
    }
    path.push([point[0], point[1]]);
  }
  return { ok: true, path };
}
