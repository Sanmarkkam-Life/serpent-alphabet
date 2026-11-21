import { describe, expect, it } from "vitest";
import { CHEST_INTERVAL, FIRST_CHEST_AT, evaluateChest } from "./chest";

/**
 * Replay a fresh learner's first completions and return the completion numbers
 * on which a chest was granted.
 */
function grantsForFreshLearner(completions: number): number[] {
  let since = 0;
  const grants: number[] = [];
  for (let total = 1; total <= completions; total++) {
    const decision = evaluateChest(since, total);
    if (decision.grant) grants.push(total);
    since = decision.lessonsSinceChest;
  }
  return grants;
}

describe("evaluateChest", () => {
  it("grants no chest before FIRST_CHEST_AT completions", () => {
    for (let total = 1; total < FIRST_CHEST_AT; total++) {
      expect(evaluateChest(total - 1, total).grant).toBe(false);
    }
    expect(grantsForFreshLearner(FIRST_CHEST_AT - 1)).toEqual([]);
  });

  it("grants the first chest at exactly FIRST_CHEST_AT", () => {
    const decision = evaluateChest(FIRST_CHEST_AT - 1, FIRST_CHEST_AT);
    expect(decision.grant).toBe(true);
    expect(decision.lessonsSinceChest).toBe(0);
    expect(grantsForFreshLearner(FIRST_CHEST_AT)).toEqual([FIRST_CHEST_AT]);
  });

  it("waits CHEST_INTERVAL completions after a chest before the next", () => {
    // First at 3, next at 3 + 10 = 13, then 23.
    expect(grantsForFreshLearner(FIRST_CHEST_AT + CHEST_INTERVAL - 1)).toEqual([
      FIRST_CHEST_AT,
    ]);
    expect(grantsForFreshLearner(FIRST_CHEST_AT + CHEST_INTERVAL)).toEqual([
      FIRST_CHEST_AT,
      FIRST_CHEST_AT + CHEST_INTERVAL,
    ]);
    expect(grantsForFreshLearner(FIRST_CHEST_AT + 2 * CHEST_INTERVAL)).toEqual([
      FIRST_CHEST_AT,
      FIRST_CHEST_AT + CHEST_INTERVAL,
      FIRST_CHEST_AT + 2 * CHEST_INTERVAL,
    ]);
  });

  it("resets the counter to 0 on a grant and increments otherwise", () => {
    expect(evaluateChest(2, 3)).toEqual({ grant: true, lessonsSinceChest: 0 });
    expect(evaluateChest(0, 4)).toEqual({ grant: false, lessonsSinceChest: 1 });
    expect(evaluateChest(9, 13)).toEqual({ grant: true, lessonsSinceChest: 0 });
  });

  it("skips the early first chest for a migrated v5 user (many completions, counter 0)", () => {
    // A v5 user with 5 prior completions gets a fresh counter of 0. Their next
    // completion (total 6) must NOT trigger the early first chest.
    expect(evaluateChest(0, 6)).toEqual({ grant: false, lessonsSinceChest: 1 });
    // ...and the interval still applies: a chest only once the counter reaches
    // CHEST_INTERVAL (here at total 15, counter 9 -> 10).
    expect(evaluateChest(CHEST_INTERVAL - 1, 15)).toEqual({
      grant: true,
      lessonsSinceChest: 0,
    });
  });
});
