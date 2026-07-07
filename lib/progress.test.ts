import { describe, expect, it } from "vitest";
import {
  defaultProgress,
  isLessonUnlocked,
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
      // Anyone with completed lessons has effectively seen both intros.
      introViewed: true,
      tamilIntroViewed: true,
      flawlessStreak: 0,
    });
  });

  it("leaves the intro unviewed for fresh v1 data", () => {
    expect(migrateV1ToV2({ completed: [] }).introViewed).toBe(false);
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
      introViewed: true,
      tamilIntroViewed: true,
      flawlessStreak: 7,
    };
    expect(normalizeProgress(valid)).toEqual(valid);
  });

  it("defaults flawlessStreak to 0 and backfills tamilIntroViewed", () => {
    // A fresh payload without the v4 fields.
    const legacy = {
      completed: [],
      xp: 0,
      streakCount: 0,
      lastActiveDate: null,
      mute: false,
      introViewed: false,
    } as Record<string, unknown>;
    const norm = normalizeProgress(legacy);
    expect(norm.flawlessStreak).toBe(0);
    expect(norm.tamilIntroViewed).toBe(false);
  });

  it("backfills tamilIntroViewed when the Soul Letters intro was seen", () => {
    const seen = normalizeProgress({
      ...defaultProgress(),
      introViewed: true,
    });
    expect(seen.tamilIntroViewed).toBe(true);
  });

  it("rejects a negative or fractional flawlessStreak", () => {
    expect(
      normalizeProgress({ ...defaultProgress(), flawlessStreak: -3 })
        .flawlessStreak,
    ).toBe(0);
    expect(
      normalizeProgress({ ...defaultProgress(), flawlessStreak: 2.5 })
        .flawlessStreak,
    ).toBe(0);
  });

  it("backfills introViewed for payloads with completed lessons", () => {
    const legacy = { ...defaultProgress(), completed: ["a"] } as Record<
      string,
      unknown
    >;
    delete legacy.introViewed;
    expect(normalizeProgress(legacy).introViewed).toBe(true);
  });

  it("keeps introViewed false for fresh payloads without it", () => {
    const legacy = { ...defaultProgress() } as Record<string, unknown>;
    delete legacy.introViewed;
    expect(normalizeProgress(legacy).introViewed).toBe(false);
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

describe("isLessonUnlocked", () => {
  const IDS = ["a", "aa", "i"];

  it("keeps every lesson locked until the intro is viewed", () => {
    const fresh = defaultProgress();
    expect(isLessonUnlocked(fresh, IDS, "a")).toBe(false);
    const viewed = { ...fresh, introViewed: true };
    expect(isLessonUnlocked(viewed, IDS, "a")).toBe(true);
    expect(isLessonUnlocked(viewed, IDS, "aa")).toBe(false);
  });

  it("unlocks exactly the next lesson as earlier ones complete", () => {
    const progress = {
      ...defaultProgress(),
      introViewed: true,
      completed: ["a"],
    };
    expect(isLessonUnlocked(progress, IDS, "aa")).toBe(true);
    expect(isLessonUnlocked(progress, IDS, "i")).toBe(false);
  });
});
