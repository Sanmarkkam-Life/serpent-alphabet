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

/** Maximum number of strokes in one letter (author strokes are few). */
export const MAX_TRACE_STROKES = 20;

export type TracePathResult =
  | { ok: true; path: NormalizedPoint[][] }
  | { ok: false; reason: string };

function isFinitePair(point: unknown): point is NormalizedPoint {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    typeof point[0] === "number" &&
    typeof point[1] === "number" &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1])
  );
}

/**
 * Validate an incoming trace_path and return it in the canonical
 * multi-stroke form `NormalizedPoint[][]`. Accepts BOTH:
 * - the legacy flat form `[[x,y],...]` (treated as one stroke), and
 * - the multi-stroke form `[[[x,y],...],...]`.
 *
 * Rules: 1..MAX_TRACE_STROKES strokes, each stroke non-empty, every point a
 * finite `[number, number]` pair, and 2..MAX_TRACE_POINTS points in total. A
 * fresh array is built so no extra smuggled fields survive.
 */
export function validateTracePath(value: unknown): TracePathResult {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "trace_path must be an array" };
  }
  if (value.length === 0) {
    return { ok: false, reason: "trace_path must not be empty" };
  }

  // Detect the flat single-stroke form: first element is a numeric pair.
  const first = value[0];
  const isFlat =
    Array.isArray(first) && first.length === 2 && typeof first[0] === "number";
  const rawStrokes: unknown[] = isFlat ? [value] : value;

  if (rawStrokes.length > MAX_TRACE_STROKES) {
    return {
      ok: false,
      reason: `trace_path must have at most ${MAX_TRACE_STROKES} strokes (got ${rawStrokes.length})`,
    };
  }

  const strokes: NormalizedPoint[][] = [];
  let totalPoints = 0;
  for (let s = 0; s < rawStrokes.length; s++) {
    const rawStroke = rawStrokes[s];
    if (!Array.isArray(rawStroke) || rawStroke.length === 0) {
      return { ok: false, reason: `stroke ${s} must be a non-empty array` };
    }
    const stroke: NormalizedPoint[] = [];
    for (let i = 0; i < rawStroke.length; i++) {
      const point = rawStroke[i];
      if (!isFinitePair(point)) {
        return {
          ok: false,
          reason: `stroke ${s} point ${i} must be a [number, number] pair of finite numbers`,
        };
      }
      stroke.push([point[0], point[1]]);
    }
    totalPoints += stroke.length;
    strokes.push(stroke);
  }

  if (totalPoints < MIN_TRACE_POINTS || totalPoints > MAX_TRACE_POINTS) {
    return {
      ok: false,
      reason: `trace_path must have ${MIN_TRACE_POINTS}-${MAX_TRACE_POINTS} points in total (got ${totalPoints})`,
    };
  }

  return { ok: true, path: strokes };
}
