import { describe, expect, it } from "vitest";
import {
  defaultProgress,
  migrateV1ToV2,
  normalizeProgress,
} from "./progress";

describe("migrateV1ToV2", () => {
  it("carries completed lessons and initializes the new fields", () => {
    const v2 = migrateV1ToV2({ completed: ["a", "aa"] });
    expect(v2).toEqual({
      completed: ["a", "aa"],
      xp: 0,
      streakCount: 0,
      lastActiveDate: null,
      mute: false,
    });
  });

  it("treats malformed v1 as empty progress", () => {
    expect(migrateV1ToV2(null).completed).toEqual([]);
    expect(migrateV1ToV2("junk").completed).toEqual([]);
    expect(migrateV1ToV2({ completed: [1, 2] }).completed).toEqual([]);
    expect(migrateV1ToV2({}).completed).toEqual([]);
  });
});

describe("normalizeProgress", () => {
  it("passes a valid v2 object through unchanged", () => {
    const valid = {
      completed: ["a"],
      xp: 120,
      streakCount: 3,
      lastActiveDate: "2026-07-05",
      mute: true,
    };
    expect(normalizeProgress(valid)).toEqual(valid);
  });

  it("repairs malformed fields to defaults without losing good ones", () => {
    const repaired = normalizeProgress({
      completed: ["a"],
      xp: -50, // invalid: negative
      streakCount: "five", // invalid: not a number
      lastActiveDate: "yesterday", // invalid: not YYYY-MM-DD
      mute: "yes", // invalid: not boolean
    });
    expect(repaired.completed).toEqual(["a"]);
    expect(repaired.xp).toBe(0);
    expect(repaired.streakCount).toBe(0);
    expect(repaired.lastActiveDate).toBeNull();
    expect(repaired.mute).toBe(false);
  });

  it("returns defaults for garbage input", () => {
    expect(normalizeProgress(null)).toEqual(defaultProgress());
    expect(normalizeProgress(42)).toEqual(defaultProgress());
    expect(normalizeProgress([])).toEqual(defaultProgress());
  });

  it("rounds fractional xp", () => {
    expect(normalizeProgress({ ...defaultProgress(), xp: 10.6 }).xp).toBe(11);
  });
});
