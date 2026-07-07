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
  const validPath = [
    [0.1, 0.2],
    [0.3, 0.4],
    [0.5, 0.6],
  ];

  it("accepts a well-formed path and returns a fresh array", () => {
    const result = validateTracePath(validPath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.path).toEqual(validPath);
      expect(result.path).not.toBe(validPath); // fresh copy
    }
  });

  it("accepts values outside 0..1 as long as they are finite", () => {
    // The spec constrains to finite numbers, not to the 0..1 range.
    expect(validateTracePath([
      [-0.5, 1.5],
      [2, -3],
    ]).ok).toBe(true);
  });

  it("rejects a non-array", () => {
    expect(validateTracePath("nope").ok).toBe(false);
    expect(validateTracePath({ length: 3 }).ok).toBe(false);
    expect(validateTracePath(null).ok).toBe(false);
  });

  it("rejects too few or too many points", () => {
    expect(validateTracePath([[0, 0]]).ok).toBe(false); // 1 < MIN
    const tooMany = Array.from({ length: MAX_TRACE_POINTS + 1 }, () => [0, 0]);
    expect(validateTracePath(tooMany).ok).toBe(false);
    // Boundaries are inclusive.
    const minPath = Array.from({ length: MIN_TRACE_POINTS }, () => [0, 0]);
    expect(validateTracePath(minPath).ok).toBe(true);
    const maxPath = Array.from({ length: MAX_TRACE_POINTS }, () => [0, 0]);
    expect(validateTracePath(maxPath).ok).toBe(true);
  });

  it("rejects malformed points", () => {
    expect(validateTracePath([[0, 0], [1]]).ok).toBe(false); // wrong arity
    expect(validateTracePath([[0, 0], [0, "x"]]).ok).toBe(false); // non-number
    expect(validateTracePath([[0, 0], [0, NaN]]).ok).toBe(false); // NaN
    expect(validateTracePath([[0, 0], [0, Infinity]]).ok).toBe(false); // Infinity
    expect(validateTracePath([[0, 0], null]).ok).toBe(false); // non-array point
    expect(validateTracePath([[0, 0], [0, 1, 2]]).ok).toBe(false); // 3-tuple
  });

  it("does not carry extra array indices beyond the pair", () => {
    // A point with extra elements is rejected (length !== 2), so no smuggling.
    expect(validateTracePath([[0, 0, 999], [1, 1]]).ok).toBe(false);
  });
});
