import type { NormalizedPoint } from "./types";

/**
 * Trace validation engine.
 *
 * Guide paths are stored in normalized 0–1 coordinates (author mode records
 * them that way) and scaled to the live canvas at render time, so a path
 * recorded on one phone works on any device.
 *
 * Validation runs in canvas-pixel space:
 * - The guide is resampled into densely spaced pixel points.
 * - Every finger sample (interpolated between MoveEvents so fast swipes
 *   don't tunnel) must stay within `tolerancePx` of the guide corridor.
 * - Guide points are only credited as covered inside a moving window around
 *   the learner's current progress, which enforces "generally increasing
 *   index" ordering while allowing small backtracking. Touching a far-ahead
 *   part of the corridor is not an error (letters cross themselves) — it
 *   simply earns no credit.
 * - Pass requires covering >= COVERAGE_THRESHOLD of the guide points.
 */

/** Fraction of guide points that must be covered to pass. */
export const COVERAGE_THRESHOLD = 0.85;

/** Coverage at which the trace auto-completes without lifting the finger. */
export const AUTO_COMPLETE_COVERAGE = 0.97;

/** Reference canvas width (px) at which `trace_tolerance` is calibrated. */
export const REFERENCE_CANVAS_WIDTH = 390;

/**
 * Width : height of the trace canvas. Author mode records at this same
 * aspect ratio, so normalized paths land identically on every device.
 */
export const TRACE_CANVAS_ASPECT = 3 / 4;

/** Guide resample spacing in px — small enough for a smooth corridor. */
const GUIDE_SPACING_PX = 4;

/** Finger interpolation spacing in px. */
const FINGER_STEP_PX = 3;

/**
 * How far ahead of current progress a guide point may be and still earn
 * coverage credit, as a fraction of the guide length. Small enough that the
 * learner cannot skip a chunk of the letter, large enough to absorb noise.
 */
const AHEAD_WINDOW_FRACTION = 0.12;

/** How far behind current progress still earns credit (backtracking). */
const BEHIND_WINDOW_FRACTION = 0.2;

export interface PixelPoint {
  x: number;
  y: number;
}

export type TraceFailure = "corridor" | "coverage" | "timeout";

export interface TraceSession {
  /** Guide resampled to pixel space, in drawing order. */
  readonly guidePx: readonly PixelPoint[];
  readonly tolerancePx: number;
  /** covered[i] is true once the finger has passed near guidePx[i] in order. */
  readonly covered: readonly boolean[];
  /** Highest guide index credited so far (-1 before the first touch). */
  readonly progress: number;
  readonly lastFinger: PixelPoint | null;
  readonly failure: TraceFailure | null;
}

/** Scale a stored tolerance (calibrated at 390px width) to this canvas. */
export function scaleTolerance(
  storedTolerance: number,
  canvasWidth: number,
): number {
  return (storedTolerance * canvasWidth) / REFERENCE_CANVAS_WIDTH;
}

function distance(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Convert a normalized path to pixel space for a given canvas size. */
export function toPixelPath(
  guide: readonly NormalizedPoint[],
  canvasWidth: number,
  canvasHeight: number,
): PixelPoint[] {
  return guide.map(([nx, ny]) => ({
    x: nx * canvasWidth,
    y: ny * canvasHeight,
  }));
}

/** Resample a polyline so consecutive points are ~spacing px apart. */
export function resamplePath(
  points: readonly PixelPoint[],
  spacing: number = GUIDE_SPACING_PX,
): PixelPoint[] {
  if (points.length === 0) return [];
  const result: PixelPoint[] = [{ ...points[0] }];
  let prev = points[0];
  let acc = 0; // arc length accumulated since the last emitted sample
  for (let i = 1; i < points.length; i++) {
    const next = points[i];
    let d = distance(prev, next);
    while (acc + d >= spacing && d > 0) {
      const t = (spacing - acc) / d;
      prev = {
        x: prev.x + (next.x - prev.x) * t,
        y: prev.y + (next.y - prev.y) * t,
      };
      result.push({ ...prev });
      d = distance(prev, next);
      acc = 0;
    }
    acc += d;
    prev = next;
  }
  const tail = points[points.length - 1];
  if (distance(result[result.length - 1], tail) > spacing / 2) {
    result.push({ ...tail });
  }
  return result;
}

export function createTraceSession(
  guide: readonly NormalizedPoint[],
  canvasWidth: number,
  canvasHeight: number,
  storedTolerance: number,
): TraceSession {
  const guidePx = resamplePath(toPixelPath(guide, canvasWidth, canvasHeight));
  return {
    guidePx,
    tolerancePx: scaleTolerance(storedTolerance, canvasWidth),
    covered: guidePx.map(() => false),
    progress: -1,
    lastFinger: null,
    failure: null,
  };
}

export function coveredFraction(session: TraceSession): number {
  if (session.covered.length === 0) return 0;
  let count = 0;
  for (const c of session.covered) if (c) count++;
  return count / session.covered.length;
}

export function isAutoComplete(session: TraceSession): boolean {
  return (
    session.failure === null &&
    session.guidePx.length > 0 &&
    coveredFraction(session) >= AUTO_COMPLETE_COVERAGE
  );
}

/** Nearest guide index and its distance for a finger position. */
function nearestGuidePoint(
  guidePx: readonly PixelPoint[],
  p: PixelPoint,
): { index: number; dist: number } {
  let best = Infinity;
  let bestIndex = -1;
  for (let i = 0; i < guidePx.length; i++) {
    const d = distance(guidePx[i], p);
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return { index: bestIndex, dist: best };
}

function creditSample(
  guidePx: readonly PixelPoint[],
  covered: boolean[],
  progress: number,
  tolerancePx: number,
  p: PixelPoint,
): { progress: number; inCorridor: boolean } {
  const n = guidePx.length;
  const ahead = Math.max(6, Math.round(n * AHEAD_WINDOW_FRACTION));
  const behind = Math.max(6, Math.round(n * BEHIND_WINDOW_FRACTION));
  const windowStart = Math.max(0, progress - behind);
  const windowEnd = Math.min(n - 1, Math.max(progress, 0) + ahead);

  let inCorridor = false;
  let newProgress = progress;
  // Credit every in-window guide point the finger is currently near — the
  // corridor is wide, so one sample can legitimately cover several points.
  for (let i = windowStart; i <= windowEnd; i++) {
    if (distance(guidePx[i], p) <= tolerancePx) {
      covered[i] = true;
      inCorridor = true;
      if (i > newProgress) newProgress = i;
    }
  }
  if (!inCorridor) {
    // Not near the active window; still fine if near ANY part of the guide
    // (letters cross themselves) — it just earns no coverage credit.
    const { dist } = nearestGuidePoint(guidePx, p);
    inCorridor = dist <= tolerancePx;
  }
  return { progress: newProgress, inCorridor };
}

/**
 * Feed one finger sample (canvas px). Interpolates from the previous sample
 * so fast movements cannot jump the corridor checks. Returns new state; on a
 * corridor violation `failure` is set to "corridor".
 */
export function addFingerPoint(
  session: TraceSession,
  x: number,
  y: number,
): TraceSession {
  if (session.failure !== null || session.guidePx.length === 0) return session;

  const target: PixelPoint = { x, y };
  const covered = [...session.covered];
  let progress = session.progress;

  const samples: PixelPoint[] = [];
  if (session.lastFinger) {
    const total = distance(session.lastFinger, target);
    const steps = Math.max(1, Math.ceil(total / FINGER_STEP_PX));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      samples.push({
        x: session.lastFinger.x + (target.x - session.lastFinger.x) * t,
        y: session.lastFinger.y + (target.y - session.lastFinger.y) * t,
      });
    }
  } else {
    samples.push(target);
  }

  for (const p of samples) {
    const result = creditSample(
      session.guidePx,
      covered,
      progress,
      session.tolerancePx,
      p,
    );
    progress = result.progress;
    if (!result.inCorridor) {
      return {
        ...session,
        covered,
        progress,
        lastFinger: target,
        failure: "corridor",
      };
    }
  }

  return { ...session, covered, progress, lastFinger: target, failure: null };
}

/** Called when the finger lifts: pass or fail on coverage. */
export function evaluateLift(session: TraceSession): {
  passed: boolean;
  failure: TraceFailure | null;
} {
  if (session.failure !== null) {
    return { passed: false, failure: session.failure };
  }
  if (coveredFraction(session) >= COVERAGE_THRESHOLD) {
    return { passed: true, failure: null };
  }
  return { passed: false, failure: "coverage" };
}

/* ------------------------------------------------------------------ */
/* Author-mode helpers                                                 */
/* ------------------------------------------------------------------ */

/** Convert a recorded pixel path to normalized 0–1 coordinates. */
export function normalizePath(
  pointsPx: readonly PixelPoint[],
  canvasWidth: number,
  canvasHeight: number,
): NormalizedPoint[] {
  return pointsPx.map(({ x, y }) => [
    clamp01(x / canvasWidth),
    clamp01(y / canvasHeight),
  ]);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Drop points closer than `minSpacing` (normalized units) to the previous
 * kept point, and round coordinates to 4 decimals for compact JSON.
 */
export function simplifyNormalizedPath(
  points: readonly NormalizedPoint[],
  minSpacing = 0.008,
): NormalizedPoint[] {
  const result: NormalizedPoint[] = [];
  for (const [x, y] of points) {
    const prev = result[result.length - 1];
    if (
      !prev ||
      Math.hypot(x - prev[0], y - prev[1]) >= minSpacing
    ) {
      result.push([round4(x), round4(y)]);
    }
  }
  return result;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
