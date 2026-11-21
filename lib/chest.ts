/**
 * Treasure-chest scarcity. A chest is a rare reward, not an every-lesson one.
 * All the tuning lives here.
 */

/** A chest every this many completions. */
export const CHEST_INTERVAL = 10;
/**
 * The very first chest comes early, so a new learner discovers chests and
 * shields before the mechanic could feel absent. After the first, the interval
 * takes over. Set this equal to CHEST_INTERVAL for a pure 1-in-N with no early
 * grant.
 */
export const FIRST_CHEST_AT = 3;

export interface ChestDecision {
  grant: boolean;
  /** The counter value to store after this completion. */
  lessonsSinceChest: number;
}

/**
 * Decide whether a lesson's FIRST completion earns a chest. Pure: the caller
 * supplies the prior counter and the total completion count (INCLUDING the
 * lesson just finished) and gets back whether to grant plus the new counter.
 *
 * "Never received a chest" needs no extra stored flag. Until the first grant,
 * this counter has only ever advanced in lockstep with the total completion
 * count (both start at 0, both +1 per first completion, and only a grant
 * resets the counter). So before this completion they were equal exactly when
 * no chest had ever been granted. This also makes existing v5 users — who saw
 * a chest on every completion and now carry a fresh 0 counter against many
 * completions — correctly skip the early grant.
 */
export function evaluateChest(
  lessonsSinceChest: number,
  totalCompletions: number,
): ChestDecision {
  const since = lessonsSinceChest + 1;
  const neverReceived = lessonsSinceChest === totalCompletions - 1;
  const earlyFirst = neverReceived && totalCompletions >= FIRST_CHEST_AT;
  const reachedInterval = since >= CHEST_INTERVAL;
  if (earlyFirst || reachedInterval) {
    return { grant: true, lessonsSinceChest: 0 };
  }
  return { grant: false, lessonsSinceChest: since };
}
