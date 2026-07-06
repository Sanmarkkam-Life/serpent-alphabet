import { describe, expect, it } from "vitest";
import {
  BASE_TASK_XP,
  COMBO_MAX,
  COMBO_START,
  baseXpFor,
  comboAfterFail,
  comboAfterPass,
  parTimeSeconds,
  scaleTaskXp,
  standardXpTaskCount,
  taskXp,
  testOutXp,
  timeBonusXp,
} from "./xp";

describe("base XP", () => {
  it("grants 10 XP for every task except learn", () => {
    expect(baseXpFor("learn")).toBe(0);
    expect(baseXpFor("pronounce")).toBe(BASE_TASK_XP);
    expect(baseXpFor("trace")).toBe(BASE_TASK_XP);
    expect(baseXpFor("recognize")).toBe(BASE_TASK_XP);
  });
});

describe("combo", () => {
  it("climbs +0.5 per pass and caps at 3.0", () => {
    let combo = COMBO_START;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(combo);
      combo = comboAfterPass(combo);
    }
    expect(seen).toEqual([1.0, 1.5, 2.0, 2.5, 3.0, 3.0]);
    expect(combo).toBe(COMBO_MAX);
  });

  it("resets to 1.0 on any fail", () => {
    expect(comboAfterFail()).toBe(COMBO_START);
    let combo = COMBO_START;
    for (let i = 0; i < 4; i++) combo = comboAfterPass(combo);
    expect(combo).toBe(3.0);
    expect(comboAfterFail()).toBe(1.0);
  });

  it("multiplies base XP, rounded", () => {
    expect(taskXp("recognize", 1.0, null, 12).total).toBe(10);
    expect(taskXp("recognize", 1.5, null, 12).total).toBe(15);
    expect(taskXp("recognize", 3.0, null, 12).total).toBe(30);
    expect(taskXp("recognize", 1.5, null, 12).comboBonus).toBe(5);
    // learn earns nothing at any combo
    expect(taskXp("learn", 3.0, 0, 12).total).toBe(0);
  });
});

describe("time bonus", () => {
  it("applies to trace and recognize only", () => {
    expect(parTimeSeconds("trace", 12)).toBeCloseTo(7.2);
    expect(parTimeSeconds("recognize", 12)).toBe(5);
    expect(parTimeSeconds("learn", 12)).toBeNull();
    expect(parTimeSeconds("pronounce", 12)).toBeNull();
    expect(timeBonusXp("pronounce", 0, 12)).toBe(0);
    expect(timeBonusXp("learn", 0, 12)).toBe(0);
  });

  it("scales linearly: instant = +50% of base, at par = 0, over par = 0", () => {
    expect(timeBonusXp("recognize", 0, 12)).toBe(5); // +50% of 10
    expect(timeBonusXp("recognize", 5, 12)).toBe(0); // exactly at par
    expect(timeBonusXp("recognize", 9, 12)).toBe(0); // over par: no penalty
    expect(timeBonusXp("recognize", 2.5, 12)).toBe(3); // round(2.5)
    // trace par = 12 * 0.6 = 7.2s
    expect(timeBonusXp("trace", 0, 12)).toBe(5);
    expect(timeBonusXp("trace", 1.8, 12)).toBe(4); // 75% headroom -> 3.75
    expect(timeBonusXp("trace", 7.2, 12)).toBe(0);
    expect(timeBonusXp("trace", 60, 12)).toBe(0);
  });

  it("grants no bonus when elapsed time was not measured", () => {
    expect(timeBonusXp("trace", null, 12)).toBe(0);
    expect(taskXp("trace", 2.0, null, 12).timeBonus).toBe(0);
  });

  it("adds on top of the combo-multiplied base", () => {
    const xp = taskXp("recognize", 2.0, 0, 12);
    expect(xp).toEqual({ base: 10, comboBonus: 10, timeBonus: 5, total: 25 });
  });
});

describe("review scaling", () => {
  it("halves each component with rounding, total stays consistent", () => {
    const xp = taskXp("recognize", 1.5, 2.5, 12); // 10 + 5 + 3 = 18
    const scaled = scaleTaskXp(xp, 0.5);
    expect(scaled.base).toBe(5);
    expect(scaled.comboBonus).toBe(3); // round(2.5)
    expect(scaled.timeBonus).toBe(2); // round(1.5)
    expect(scaled.total).toBe(scaled.base + scaled.comboBonus + scaled.timeBonus);
  });
});

describe("test-out reward", () => {
  it("awards all five standard tasks at 2.0x plus earned time bonuses", () => {
    expect(standardXpTaskCount()).toBe(5);
    const xp = testOutXp({
      traceElapsedSeconds: null,
      recognizeElapsedSeconds: null,
      traceTimeLimit: 12,
    });
    expect(xp.base).toBe(50);
    expect(xp.comboBonus).toBe(50);
    expect(xp.timeBonus).toBe(0);
    expect(xp.total).toBe(100);
  });

  it("includes time bonuses from the two performed tasks", () => {
    const xp = testOutXp({
      traceElapsedSeconds: 0,
      recognizeElapsedSeconds: 0,
      traceTimeLimit: 12,
    });
    expect(xp.timeBonus).toBe(10); // +5 trace, +5 recognize
    expect(xp.total).toBe(110);
  });
});
