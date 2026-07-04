import { describe, expect, it } from "vitest";
import {
  createInitialState,
  currentTask,
  failCurrent,
  isComplete,
  isRedeeming,
  passCurrent,
  remainingPasses,
  type MasteryQueueState,
} from "./masteryQueue";

function passUntilComplete(state: MasteryQueueState): MasteryQueueState {
  let s = state;
  let guard = 0;
  while (!isComplete(s)) {
    s = passCurrent(s);
    if (++guard > 100) throw new Error("did not converge");
  }
  return s;
}

describe("masteryQueue", () => {
  it("starts with the canonical task plan in order", () => {
    const state = createInitialState();
    expect(state.queue.map((t) => t.key)).toEqual([
      "learn",
      "pronounce",
      "trace",
      "recognize-1",
      "recognize-2",
      "recognize-3",
    ]);
    expect(state.queue.every((t) => t.passesNeeded === 1)).toBe(true);
    expect(isComplete(state)).toBe(false);
  });

  it("advances to the next task on a pass", () => {
    let state = createInitialState();
    state = passCurrent(state);
    expect(currentTask(state)?.key).toBe("pronounce");
    expect(state.queue).toHaveLength(5);
  });

  it("requeues a failed task at the back with a redemption of 2", () => {
    let state = createInitialState();
    state = passCurrent(state); // learn passed
    state = failCurrent(state); // pronounce failed
    expect(currentTask(state)?.key).toBe("trace");
    const requeued = state.queue[state.queue.length - 1];
    expect(requeued.key).toBe("pronounce");
    expect(requeued.passesNeeded).toBe(2);
  });

  it("requires two consecutive passes to clear a failed task", () => {
    let state = createInitialState();
    state = failCurrent(state); // learn fails (hypothetically)
    // Clear the rest of the original queue.
    for (let i = 0; i < 5; i++) state = passCurrent(state);
    expect(currentTask(state)?.key).toBe("learn");
    expect(isRedeeming(state)).toBe(true);

    state = passCurrent(state); // first redemption pass
    expect(currentTask(state)?.key).toBe("learn"); // still owed one more
    expect(currentTask(state)?.passesNeeded).toBe(1);

    state = passCurrent(state); // second consecutive pass
    expect(isComplete(state)).toBe(true);
  });

  it("resets the redemption streak when a redeeming task fails again", () => {
    let state = createInitialState();
    state = failCurrent(state);
    for (let i = 0; i < 5; i++) state = passCurrent(state);
    state = passCurrent(state); // 1 of 2 redemption passes
    state = failCurrent(state); // streak broken
    expect(currentTask(state)?.key).toBe("learn");
    expect(currentTask(state)?.passesNeeded).toBe(2);
    state = passCurrent(state);
    expect(isComplete(state)).toBe(false); // one pass is not enough
    state = passCurrent(state);
    expect(isComplete(state)).toBe(true);
  });

  it("is complete only when the queue is empty (no outstanding redemptions)", () => {
    let state = createInitialState();
    for (let i = 0; i < 3; i++) state = passCurrent(state);
    state = failCurrent(state); // recognize-1 fails
    for (let i = 0; i < 2; i++) state = passCurrent(state); // recognize-2, -3
    expect(isComplete(state)).toBe(false); // recognize-1 still owes 2 passes
    expect(remainingPasses(state)).toBe(2);
    state = passCurrent(state);
    expect(isComplete(state)).toBe(false);
    state = passCurrent(state);
    expect(isComplete(state)).toBe(true);
  });

  it("completes a clean run after exactly six passes", () => {
    let state = createInitialState();
    for (let i = 0; i < 6; i++) {
      expect(isComplete(state)).toBe(false);
      state = passCurrent(state);
    }
    expect(isComplete(state)).toBe(true);
  });

  it("converges even after repeated failures", () => {
    let state = createInitialState();
    for (let round = 0; round < 4; round++) {
      state = failCurrent(state);
    }
    state = passUntilComplete(state);
    expect(isComplete(state)).toBe(true);
  });

  it("never mutates the input state", () => {
    const state = createInitialState();
    const snapshot = JSON.stringify(state);
    passCurrent(state);
    failCurrent(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("throws when passing or failing an empty queue", () => {
    const empty: MasteryQueueState = { queue: [] };
    expect(() => passCurrent(empty)).toThrow();
    expect(() => failCurrent(empty)).toThrow();
  });
});
