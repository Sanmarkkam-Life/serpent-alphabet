import { describe, expect, it } from "vitest";
import {
  addFingerPoint,
  addFingerPointMulti,
  countStrokePoints,
  coveredFraction,
  createMultiStrokeSession,
  createTraceSession,
  evaluateLift,
  isAutoComplete,
  liftStrokeMulti,
  multiCoveredFraction,
  normalizePath,
  normalizeTracePath,
  resamplePath,
  scaleTolerance,
  simplifyNormalizedPath,
  type MultiStrokeSession,
  type TraceSession,
} from "./trace";
import type { NormalizedPoint } from "./types";

const W = 390;
const H = 520;

/** Horizontal line across the middle of the canvas. */
const LINE_GUIDE: NormalizedPoint[] = [
  [0.1, 0.5],
  [0.9, 0.5],
];

function traceAlong(
  session: TraceSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 40,
): TraceSession {
  let s = session;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    s = addFingerPoint(
      s,
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
    );
    if (s.failure) return s;
  }
  return s;
}

describe("resamplePath", () => {
  it("produces evenly spaced points including endpoints", () => {
    const pts = resamplePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
    );
    expect(pts.length).toBeGreaterThanOrEqual(10);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    const last = pts[pts.length - 1];
    expect(last.x).toBeCloseTo(100, 0);
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      expect(d).toBeLessThanOrEqual(10.5);
    }
  });
});

describe("scaleTolerance", () => {
  it("keeps the stored value at the reference width and scales elsewhere", () => {
    expect(scaleTolerance(40, 390)).toBe(40);
    expect(scaleTolerance(40, 780)).toBe(80);
  });
});

describe("trace session", () => {
  it("passes when the full guide is traced within tolerance", () => {
    let s = createTraceSession(LINE_GUIDE, W, H, 40);
    s = traceAlong(s, { x: 0.1 * W, y: 0.5 * H }, { x: 0.9 * W, y: 0.5 * H });
    expect(s.failure).toBeNull();
    expect(coveredFraction(s)).toBeGreaterThan(0.95);
    expect(evaluateLift(s).passed).toBe(true);
    expect(isAutoComplete(s)).toBe(true);
  });

  it("fails with 'coverage' when the finger lifts halfway", () => {
    let s = createTraceSession(LINE_GUIDE, W, H, 40);
    s = traceAlong(s, { x: 0.1 * W, y: 0.5 * H }, { x: 0.5 * W, y: 0.5 * H });
    expect(s.failure).toBeNull();
    const result = evaluateLift(s);
    expect(result.passed).toBe(false);
    expect(result.failure).toBe("coverage");
  });

  it("fails with 'corridor' when the finger strays beyond tolerance", () => {
    let s = createTraceSession(LINE_GUIDE, W, H, 40);
    s = traceAlong(s, { x: 0.1 * W, y: 0.5 * H }, { x: 0.4 * W, y: 0.5 * H });
    expect(s.failure).toBeNull();
    // Wander far above the line — well beyond the 40px corridor.
    s = addFingerPoint(s, 0.4 * W, 0.5 * H - 120);
    expect(s.failure).toBe("corridor");
    expect(evaluateLift(s).passed).toBe(false);
  });

  it("does not credit coverage for skipping ahead out of order", () => {
    let s = createTraceSession(LINE_GUIDE, W, H, 40);
    // Touch the start briefly, then jump the finger to the end region by
    // sweeping OUTSIDE the corridor? That would fail. Instead simulate a
    // fresh touch at the far end: only start + a small ahead-window should
    // ever be credited from the start touch.
    s = addFingerPoint(s, 0.1 * W, 0.5 * H);
    const early = coveredFraction(s);
    expect(early).toBeLessThan(0.3);
    // A separate session starting at the END of the guide gets no more than
    // the ahead window near the start... progress starts at -1 so only the
    // window near index 0 is creditable.
    let s2 = createTraceSession(LINE_GUIDE, W, H, 40);
    s2 = addFingerPoint(s2, 0.9 * W, 0.5 * H);
    // Finger is in the corridor (near the guide end) so no failure...
    expect(s2.failure).toBeNull();
    // ...but no meaningful coverage is credited because the end of the
    // guide is far ahead of the allowed window.
    expect(coveredFraction(s2)).toBeLessThan(0.05);
    expect(evaluateLift(s2).passed).toBe(false);
  });

  it("allows small backtracking without losing progress", () => {
    let s = createTraceSession(LINE_GUIDE, W, H, 40);
    s = traceAlong(s, { x: 0.1 * W, y: 0.5 * H }, { x: 0.5 * W, y: 0.5 * H });
    const mid = s.progress;
    // Back up slightly, then continue to the end.
    s = traceAlong(s, { x: 0.5 * W, y: 0.5 * H }, { x: 0.45 * W, y: 0.5 * H });
    expect(s.failure).toBeNull();
    expect(s.progress).toBeGreaterThanOrEqual(mid - 1);
    s = traceAlong(s, { x: 0.45 * W, y: 0.5 * H }, { x: 0.9 * W, y: 0.5 * H });
    expect(evaluateLift(s).passed).toBe(true);
  });

  it("handles an empty guide without crashing", () => {
    const s = createTraceSession([], W, H, 40);
    expect(s.guidePx).toHaveLength(0);
    expect(coveredFraction(s)).toBe(0);
    expect(isAutoComplete(s)).toBe(false);
    const after = addFingerPoint(s, 10, 10);
    expect(after.failure).toBeNull();
  });
});

describe("normalizeTracePath", () => {
  it("wraps a legacy flat path as a single stroke", () => {
    const flat: NormalizedPoint[] = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];
    expect(normalizeTracePath(flat)).toEqual([flat]);
  });

  it("passes a multi-stroke path through", () => {
    const multi = [
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      [
        [0.5, 0.6],
        [0.7, 0.8],
      ],
    ];
    expect(normalizeTracePath(multi)).toEqual(multi);
  });

  it("returns [] for empty or garbage input", () => {
    expect(normalizeTracePath([])).toEqual([]);
    expect(normalizeTracePath(null)).toEqual([]);
    expect(normalizeTracePath("nope")).toEqual([]);
    expect(normalizeTracePath(undefined)).toEqual([]);
  });

  it("drops malformed points and empty strokes", () => {
    expect(
      normalizeTracePath([
        [0.1, 0.2],
        [0.3, "x"],
        [0.5, 0.6],
      ]),
    ).toEqual([
      [
        [0.1, 0.2],
        [0.5, 0.6],
      ],
    ]);
    expect(
      normalizeTracePath([
        [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        [],
        [[0.5, 0.6]],
      ]),
    ).toEqual([
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      [[0.5, 0.6]],
    ]);
  });

  it("counts points across strokes", () => {
    expect(
      countStrokePoints([
        [
          [0, 0],
          [1, 1],
        ],
        [[2, 2]],
      ]),
    ).toBe(3);
  });
});

describe("multi-stroke session", () => {
  const STROKE_A: NormalizedPoint[] = [
    [0.1, 0.3],
    [0.9, 0.3],
  ];
  const STROKE_B: NormalizedPoint[] = [
    [0.1, 0.7],
    [0.9, 0.7],
  ];

  function drag(
    session: MultiStrokeSession,
    from: { x: number; y: number },
    to: { x: number; y: number },
    steps = 40,
  ): MultiStrokeSession {
    let s = session;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      s = addFingerPointMulti(
        s,
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
      );
      if (s.failure) break;
    }
    return s;
  }

  it("advances stroke by stroke, completing on the last lift", () => {
    let s = createMultiStrokeSession([STROKE_A, STROKE_B], W, H, 40);
    expect(s.done).toBe(false);
    expect(s.current).toBe(0);

    // Trace stroke A, lift -> advances to stroke B.
    s = drag(s, { x: 0.1 * W, y: 0.3 * H }, { x: 0.9 * W, y: 0.3 * H });
    expect(s.failure).toBeNull();
    const liftA = liftStrokeMulti(s);
    expect(liftA.advanced).toBe(true);
    expect(liftA.session.current).toBe(1);
    expect(liftA.session.done).toBe(false);

    // Trace stroke B, lift -> done.
    s = drag(liftA.session, { x: 0.1 * W, y: 0.7 * H }, { x: 0.9 * W, y: 0.7 * H });
    const liftB = liftStrokeMulti(s);
    expect(liftB.advanced).toBe(false);
    expect(liftB.session.done).toBe(true);
    expect(liftB.session.failure).toBeNull();
  });

  it("fails the whole trace if a stroke lifts with too little coverage", () => {
    let s = createMultiStrokeSession([STROKE_A, STROKE_B], W, H, 40);
    // Only trace the first third of stroke A, then lift.
    s = drag(s, { x: 0.1 * W, y: 0.3 * H }, { x: 0.35 * W, y: 0.3 * H });
    const lift = liftStrokeMulti(s);
    expect(lift.advanced).toBe(false);
    expect(lift.session.failure).toBe("coverage");
  });

  it("fails on a corridor breach mid-stroke", () => {
    let s = createMultiStrokeSession([STROKE_A, STROKE_B], W, H, 40);
    s = addFingerPointMulti(s, 0.1 * W, 0.3 * H);
    s = addFingerPointMulti(s, 0.4 * W, 0.3 * H - 150); // far above the line
    expect(s.failure).toBe("corridor");
  });

  it("auto-completes a single-stroke path without a lift", () => {
    let s = createMultiStrokeSession([STROKE_A], W, H, 40);
    s = drag(s, { x: 0.1 * W, y: 0.3 * H }, { x: 0.9 * W, y: 0.3 * H });
    expect(s.done).toBe(true); // last (only) stroke auto-completes
  });

  it("aggregates coverage across strokes", () => {
    const s = createMultiStrokeSession([STROKE_A, STROKE_B], W, H, 40);
    expect(multiCoveredFraction(s)).toBe(0);
    const traced = drag(s, { x: 0.1 * W, y: 0.3 * H }, { x: 0.9 * W, y: 0.3 * H });
    // Stroke A fully covered, B untouched: about half overall.
    expect(multiCoveredFraction(traced)).toBeGreaterThan(0.35);
    expect(multiCoveredFraction(traced)).toBeLessThan(0.65);
  });
});

describe("author-mode helpers", () => {
  it("normalizes pixel points into 0–1 and clamps overflow", () => {
    const normalized = normalizePath(
      [
        { x: 0, y: 0 },
        { x: 390, y: 520 },
        { x: 500, y: -10 },
      ],
      390,
      520,
    );
    expect(normalized[0]).toEqual([0, 0]);
    expect(normalized[1]).toEqual([1, 1]);
    expect(normalized[2]).toEqual([1, 0]);
  });

  it("simplifies dense paths and rounds coordinates", () => {
    const dense: NormalizedPoint[] = [];
    for (let i = 0; i <= 1000; i++) dense.push([i / 1000, 0.123456]);
    const simple = simplifyNormalizedPath(dense);
    expect(simple.length).toBeLessThan(200);
    expect(simple[0][1]).toBe(0.1235);
  });
});
