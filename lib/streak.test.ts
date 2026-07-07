import { describe, expect, it } from "vitest";
import {
  getStreakMultiplier,
  localDateString,
  nextDay,
  recordActiveDay,
} from "./streak";

describe("localDateString", () => {
  it("formats in local time with zero padding", () => {
    const date = new Date(2026, 0, 5, 23, 59); // Jan 5 2026, local
    expect(localDateString(date)).toBe("2026-01-05");
  });
});

describe("nextDay", () => {
  it("handles month and year boundaries", () => {
    expect(nextDay("2026-01-31")).toBe("2026-02-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2028-02-28")).toBe("2028-02-29"); // leap year
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
  });
});

describe("recordActiveDay", () => {
  const fresh = { lastActiveDate: null, streakCount: 0 };

  it("starts at 1 on first-ever activity", () => {
    expect(recordActiveDay(fresh, "2026-07-05")).toEqual({
      lastActiveDate: "2026-07-05",
      streakCount: 1,
    });
  });

  it("does not increment on same-day repeat activity", () => {
    const one = recordActiveDay(fresh, "2026-07-05");
    expect(recordActiveDay(one, "2026-07-05")).toEqual(one);
  });

  it("increments on the next consecutive day", () => {
    const one = recordActiveDay(fresh, "2026-07-05");
    const two = recordActiveDay(one, "2026-07-06");
    expect(two.streakCount).toBe(2);
    const three = recordActiveDay(two, "2026-07-07");
    expect(three.streakCount).toBe(3);
  });

  it("resets to 1 after a missed day", () => {
    const one = recordActiveDay(fresh, "2026-07-05");
    const two = recordActiveDay(one, "2026-07-06");
    const reset = recordActiveDay(two, "2026-07-08"); // skipped the 7th
    expect(reset).toEqual({ lastActiveDate: "2026-07-08", streakCount: 1 });
  });

  it("keeps counting across month boundaries", () => {
    const one = recordActiveDay(fresh, "2026-01-31");
    const two = recordActiveDay(one, "2026-02-01");
    expect(two.streakCount).toBe(2);
  });
});

describe("getStreakMultiplier", () => {
  it("returns the correct multiplier at every tier boundary", () => {
    expect(getStreakMultiplier(0)).toBe(1.0);
    expect(getStreakMultiplier(4)).toBe(1.0);
    expect(getStreakMultiplier(5)).toBe(1.1);
    expect(getStreakMultiplier(9)).toBe(1.1);
    expect(getStreakMultiplier(10)).toBe(1.2);
    expect(getStreakMultiplier(19)).toBe(1.2);
    expect(getStreakMultiplier(20)).toBe(1.5);
    expect(getStreakMultiplier(49)).toBe(1.5);
    expect(getStreakMultiplier(50)).toBe(2.0);
    expect(getStreakMultiplier(1000)).toBe(2.0);
  });

  it("applies correctly to a lesson XP total", () => {
    const base = 120;
    expect(Math.round(base * getStreakMultiplier(4))).toBe(120);
    expect(Math.round(base * getStreakMultiplier(5))).toBe(132);
    expect(Math.round(base * getStreakMultiplier(20))).toBe(180);
    expect(Math.round(base * getStreakMultiplier(50))).toBe(240);
  });
});
