/**
 * Snake levels: total XP maps to a level badge on the home screen.
 * Tune names and thresholds here; everything else derives from this table.
 * Must stay sorted by ascending threshold, first entry at 0.
 */

export interface SnakeLevel {
  /** Total XP required to reach this level. */
  threshold: number;
  name: string;
  emoji: string;
}

export const SNAKE_LEVELS: readonly SnakeLevel[] = [
  { threshold: 0, name: "Hatchling", emoji: "🥚" },
  { threshold: 150, name: "Grass Snake", emoji: "🌱" },
  { threshold: 400, name: "Viper", emoji: "🐍" },
  { threshold: 800, name: "Cobra", emoji: "👑" },
  { threshold: 1500, name: "Naga", emoji: "✨" },
];

export function levelForXp(xp: number): SnakeLevel {
  let current = SNAKE_LEVELS[0];
  for (const level of SNAKE_LEVELS) {
    if (xp >= level.threshold) current = level;
    else break;
  }
  return current;
}

/** The next level to reach, or null at the top of the ladder. */
export function nextLevelFor(xp: number): SnakeLevel | null {
  for (const level of SNAKE_LEVELS) {
    if (xp < level.threshold) return level;
  }
  return null;
}

/**
 * The level newly reached by going from `beforeXp` to `afterXp`, or null
 * if no threshold was crossed. Crossing several at once reports the
 * highest one.
 */
export function levelUpBetween(
  beforeXp: number,
  afterXp: number,
): SnakeLevel | null {
  const before = levelForXp(beforeXp);
  const after = levelForXp(afterXp);
  return after.threshold > before.threshold ? after : null;
}
