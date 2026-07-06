import { describe, expect, it } from "vitest";
import {
  SNAKE_LEVELS,
  levelForXp,
  levelUpBetween,
  nextLevelFor,
} from "./levels";

describe("snake levels", () => {
  it("keeps the table sorted and starting at 0", () => {
    expect(SNAKE_LEVELS[0].threshold).toBe(0);
    for (let i = 1; i < SNAKE_LEVELS.length; i++) {
      expect(SNAKE_LEVELS[i].threshold).toBeGreaterThan(
        SNAKE_LEVELS[i - 1].threshold,
      );
    }
  });

  it("maps XP to the right level at exact boundaries", () => {
    expect(levelForXp(0).name).toBe("Hatchling");
    expect(levelForXp(149).name).toBe("Hatchling");
    expect(levelForXp(150).name).toBe("Grass Snake");
    expect(levelForXp(399).name).toBe("Grass Snake");
    expect(levelForXp(400).name).toBe("Viper");
    expect(levelForXp(800).name).toBe("Cobra");
    expect(levelForXp(1499).name).toBe("Cobra");
    expect(levelForXp(1500).name).toBe("Naga");
    expect(levelForXp(999999).name).toBe("Naga");
  });

  it("knows the next level to reach", () => {
    expect(nextLevelFor(0)?.name).toBe("Grass Snake");
    expect(nextLevelFor(400)?.name).toBe("Cobra");
    expect(nextLevelFor(1500)).toBeNull();
  });

  it("detects a level-up between two totals", () => {
    expect(levelUpBetween(140, 160)?.name).toBe("Grass Snake");
    expect(levelUpBetween(100, 120)).toBeNull();
    expect(levelUpBetween(150, 160)).toBeNull(); // already there
    // Crossing two thresholds at once reports the highest.
    expect(levelUpBetween(100, 450)?.name).toBe("Viper");
  });
});
