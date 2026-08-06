import { describe, expect, it } from "vitest";
import {
  applyDailyRollover,
  applyStreakMultipliers,
  daysBetween,
  getDailyStreakMultiplier,
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

describe("getDailyStreakMultiplier", () => {
  it("returns the correct multiplier at every tier boundary", () => {
    expect(getDailyStreakMultiplier(0)).toBe(1.0);
    expect(getDailyStreakMultiplier(2)).toBe(1.0);
    expect(getDailyStreakMultiplier(3)).toBe(1.05);
    expect(getDailyStreakMultiplier(6)).toBe(1.05);
    expect(getDailyStreakMultiplier(7)).toBe(1.1);
    expect(getDailyStreakMultiplier(13)).toBe(1.1);
    expect(getDailyStreakMultiplier(14)).toBe(1.15);
    expect(getDailyStreakMultiplier(29)).toBe(1.15);
    expect(getDailyStreakMultiplier(30)).toBe(1.25);
    expect(getDailyStreakMultiplier(365)).toBe(1.25);
  });
});

describe("applyStreakMultipliers", () => {
  it("multiplies base by flawless and daily, rounded once", () => {
    // 120 * 1.5 (flawless@20) * 1.2 ... use exact tiers:
    // flawless 20 -> 1.5, daily 7 -> 1.1  => 120 * 1.5 * 1.1 = 198
    const r = applyStreakMultipliers(120, 20, 7);
    expect(r.flawlessMultiplier).toBe(1.5);
    expect(r.dailyMultiplier).toBe(1.1);
    expect(r.finalTotal).toBe(198);
  });

  it("rounds the combined product correctly", () => {
    // 121 * 1.1 (flawless@5) * 1.05 (daily@3) = 139.755 -> 140
    const r = applyStreakMultipliers(121, 5, 3);
    expect(r.finalTotal).toBe(140);
  });

  it("returns the base total unchanged when both multipliers are 1.0", () => {
    const r = applyStreakMultipliers(120, 4, 2);
    expect(r.flawlessMultiplier).toBe(1.0);
    expect(r.dailyMultiplier).toBe(1.0);
    expect(r.finalTotal).toBe(120);
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days across boundaries", () => {
    expect(daysBetween("2026-07-05", "2026-07-05")).toBe(0);
    expect(daysBetween("2026-07-05", "2026-07-06")).toBe(1);
    expect(daysBetween("2026-07-05", "2026-07-07")).toBe(2);
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-02")).toBe(2);
  });
});

describe("applyDailyRollover", () => {
  it("preserves the streak and spends a shield after one missed day", () => {
    // Active on the 5th, opening on the 7th: the 6th was missed.
    const res = applyDailyRollover(
      { lastActiveDate: "2026-07-05", streakCount: 4 },
      1,
      "2026-07-07",
    );
    expect(res.dailyShieldUsed).toBe(true);
    // Advanced to the missed day so today can continue the streak.
    expect(res.streak).toEqual({
      lastActiveDate: "2026-07-06",
      streakCount: 4,
    });
    // And a subsequent activity today extends it rather than resetting.
    expect(recordActiveDay(res.streak, "2026-07-07").streakCount).toBe(5);
  });

  it("does nothing (and resets naturally) when no shield is owned", () => {
    const res = applyDailyRollover(
      { lastActiveDate: "2026-07-05", streakCount: 4 },
      0,
      "2026-07-07",
    );
    expect(res.dailyShieldUsed).toBe(false);
    expect(res.streak).toEqual({
      lastActiveDate: "2026-07-05",
      streakCount: 4,
    });
    // Untouched: the next activity resets the streak the normal way.
    expect(recordActiveDay(res.streak, "2026-07-07").streakCount).toBe(1);
  });

  it("does not spend a shield for same-day or next-day opens", () => {
    const sameDay = applyDailyRollover(
      { lastActiveDate: "2026-07-05", streakCount: 3 },
      2,
      "2026-07-05",
    );
    expect(sameDay.dailyShieldUsed).toBe(false);
    const nextDayOpen = applyDailyRollover(
      { lastActiveDate: "2026-07-05", streakCount: 3 },
      2,
      "2026-07-06",
    );
    expect(nextDayOpen.dailyShieldUsed).toBe(false);
  });

  it("does not spend a single shield when more than one day is missed", () => {
    // Opening on the 8th after the 5th: the 6th AND 7th were missed; one
    // shield cannot cover two days, so it is left for the natural reset.
    const res = applyDailyRollover(
      { lastActiveDate: "2026-07-05", streakCount: 9 },
      1,
      "2026-07-08",
    );
    expect(res.dailyShieldUsed).toBe(false);
    expect(res.streak.streakCount).toBe(9);
  });

  it("does nothing when there is no streak to protect", () => {
    expect(
      applyDailyRollover({ lastActiveDate: null, streakCount: 0 }, 3, "2026-07-07")
        .dailyShieldUsed,
    ).toBe(false);
    expect(
      applyDailyRollover(
        { lastActiveDate: "2026-07-05", streakCount: 0 },
        3,
        "2026-07-07",
      ).dailyShieldUsed,
    ).toBe(false);
  });
});
