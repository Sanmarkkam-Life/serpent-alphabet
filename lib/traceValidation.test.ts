import { describe, expect, it } from "vitest";
import {
  MAX_TRACE_POINTS,
  MIN_TRACE_POINTS,
  sanitizeLessonId,
  validateTracePath,
} from "./traceValidation";

describe("sanitizeLessonId", () => {
  it("accepts lowercase-letter ids", () => {
    expect(sanitizeLessonId("a")).toBe("a");
    expect(sanitizeLessonId("aa")).toBe("aa");
    expect(sanitizeLessonId("aytham")).toBe("aytham");
  });

  it("rejects path traversal and anything non [a-z]", () => {
    for (const bad of [
      "",
      "../a",
      "a/b",
      "a.json",
      "A",
      "a1",
      "a ",
      " a",
      "a-b",
      "..",
      "/etc/passwd",
      "content/lessons/a",
    ]) {
      expect(sanitizeLessonId(bad), bad).toBeNull();
    }
  });

  it("rejects non-string input", () => {
    expect(sanitizeLessonId(null)).toBeNull();
    expect(sanitizeLessonId(42)).toBeNull();
    expect(sanitizeLessonId(["a"])).toBeNull();
    expect(sanitizeLessonId(undefined)).toBeNull();
  });
});

describe("validateTracePath", () => {
  const validFlat = [
    [0.1, 0.2],
    [0.3, 0.4],
    [0.5, 0.6],
  ];

  it("accepts a legacy flat path and normalizes it to one stroke", () => {
    const result = validateTracePath(validFlat);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toEqual([validFlat]); // wrapped as a single stroke
      expect(result.path[0]).not.toBe(validFlat); // fresh copy
    }
  });

  it("accepts a multi-stroke path", () => {
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
    const result = validateTracePath(multi);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toEqual(multi);
      expect(result.path.length).toBe(2);
    }
  });

  it("accepts values outside 0..1 as long as they are finite", () => {
    expect(validateTracePath([
      [-0.5, 1.5],
      [2, -3],
    ]).ok).toBe(true);
  });

  it("rejects a non-array or empty path", () => {
    expect(validateTracePath("nope").ok).toBe(false);
    expect(validateTracePath({ length: 3 }).ok).toBe(false);
    expect(validateTracePath(null).ok).toBe(false);
    expect(validateTracePath([]).ok).toBe(false);
  });

  it("rejects too few or too many points in total", () => {
    expect(validateTracePath([[0, 0]]).ok).toBe(false); // 1 < MIN
    const tooMany = Array.from({ length: MAX_TRACE_POINTS + 1 }, () => [0, 0]);
    expect(validateTracePath(tooMany).ok).toBe(false);
    // Boundaries inclusive, counted across strokes.
    const minPath = Array.from({ length: MIN_TRACE_POINTS }, () => [0, 0]);
    expect(validateTracePath(minPath).ok).toBe(true);
    const maxPath = Array.from({ length: MAX_TRACE_POINTS }, () => [0, 0]);
    expect(validateTracePath(maxPath).ok).toBe(true);
    // Total across two strokes also counts.
    const split = [
      Array.from({ length: MAX_TRACE_POINTS }, () => [0, 0]),
      [[1, 1]],
    ];
    expect(validateTracePath(split).ok).toBe(false); // MAX+1 total
  });

  it("rejects empty strokes in the multi-stroke form", () => {
    expect(
      validateTracePath([
        [
          [0, 0],
          [1, 1],
        ],
        [],
      ]).ok,
    ).toBe(false);
  });

  it("rejects malformed points in either form", () => {
    expect(validateTracePath([[0, 0], [1]]).ok).toBe(false); // wrong arity (flat)
    expect(validateTracePath([[0, 0], [0, "x"]]).ok).toBe(false); // non-number
    expect(validateTracePath([[0, 0], [0, NaN]]).ok).toBe(false); // NaN
    expect(validateTracePath([[0, 0], [0, Infinity]]).ok).toBe(false); // Infinity
    expect(validateTracePath([[0, 0], null]).ok).toBe(false); // non-array point
    // A 3-tuple first element is not a pair, so it's read as multi-stroke and
    // its inner "points" (numbers) are rejected.
    expect(validateTracePath([[0, 0, 999], [1, 1]]).ok).toBe(false);
  });

  it("rejects more than MAX_TRACE_STROKES strokes", () => {
    const tooManyStrokes = Array.from({ length: 21 }, () => [
      [0, 0],
      [1, 1],
    ]);
    expect(validateTracePath(tooManyStrokes).ok).toBe(false);
  });
});
