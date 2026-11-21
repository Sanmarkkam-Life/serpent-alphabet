import { describe, expect, it } from "vitest";
import {
  addDays,
  dueLessonIds,
  normalizeReviewSchedule,
  scheduleAfterLearn,
  scheduleAfterReview,
} from "./review";

describe("review schedule", () => {
  it("adds calendar days across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("schedules the first review one day after learning", () => {
    const s = scheduleAfterLearn({}, "a", "2026-11-08");
    expect(s.a).toEqual({ step: 0, due: "2026-11-09" });
  });

  it("walks 1d, 3d, 1w, 2w on clean reviews, then graduates", () => {
    let s = scheduleAfterLearn({}, "a", "2026-11-08");
    s = scheduleAfterReview(s, "a", "2026-11-09", true);
    expect(s.a).toEqual({ step: 1, due: "2026-11-12" });
    s = scheduleAfterReview(s, "a", "2026-11-12", true);
    expect(s.a).toEqual({ step: 2, due: "2026-11-19" });
    s = scheduleAfterReview(s, "a", "2026-11-19", true);
    expect(s.a).toEqual({ step: 3, due: "2026-12-03" });
    s = scheduleAfterReview(s, "a", "2026-12-03", true);
    expect(s.a).toBeUndefined();
  });

  it("starts over at one day after a review with mistakes", () => {
    let s = scheduleAfterLearn({}, "a", "2026-11-08");
    s = scheduleAfterReview(s, "a", "2026-11-09", true);
    s = scheduleAfterReview(s, "a", "2026-11-12", false);
    expect(s.a).toEqual({ step: 0, due: "2026-11-13" });
  });

  it("leaves unscheduled letters alone on a clean review", () => {
    expect(scheduleAfterReview({}, "a", "2026-11-08", true)).toEqual({});
    expect(scheduleAfterReview({}, "a", "2026-11-08", false).a?.step).toBe(0);
  });

  it("lists due letters in path order", () => {
    const s = {
      ka: { step: 0, due: "2026-11-08" },
      a: { step: 1, due: "2026-11-01" },
      i: { step: 0, due: "2026-11-09" },
    };
    expect(dueLessonIds(s, "2026-11-08", ["a", "i", "ka"])).toEqual(["a", "ka"]);
  });

  it("drops malformed stored entries", () => {
    expect(
      normalizeReviewSchedule({
        a: { step: 1, due: "2026-11-01" },
        b: { step: 9, due: "2026-11-01" },
        c: { step: 0, due: "soon" },
        d: "x",
      }),
    ).toEqual({ a: { step: 1, due: "2026-11-01" } });
    expect(normalizeReviewSchedule(null)).toEqual({});
  });
});
