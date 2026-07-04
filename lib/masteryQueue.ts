import type { MasteryTask, TaskType } from "./types";

/**
 * Pure mastery-queue engine.
 *
 * Rules:
 * - Tasks run in queue order; the current task is the queue head.
 * - Passing decrements the head's `passesNeeded`. At 0 the task is cleared
 *   and removed. If passes are still owed (redemption), the task stays at
 *   the head so the passes are consecutive ("twice in a row").
 * - Failing moves the head to the back of the queue and sets its
 *   `passesNeeded` to REDEMPTION_PASSES (2) — even mid-redemption, a fail
 *   resets the streak.
 * - The lesson is complete only when the queue is empty; redeeming tasks
 *   remain in the queue, so an empty queue implies no outstanding
 *   redemptions.
 *
 * All functions are pure: they return new state and never mutate input.
 */

export const REDEMPTION_PASSES = 2;

export interface MasteryQueueState {
  queue: readonly MasteryTask[];
}

/** The task sequence every lesson starts with. */
export const INITIAL_TASK_PLAN: ReadonlyArray<{ key: string; type: TaskType }> =
  [
    { key: "learn", type: "learn" },
    { key: "pronounce", type: "pronounce" },
    { key: "trace", type: "trace" },
    { key: "recognize-1", type: "recognize" },
    { key: "recognize-2", type: "recognize" },
    { key: "recognize-3", type: "recognize" },
  ];

export function createInitialState(): MasteryQueueState {
  return {
    queue: INITIAL_TASK_PLAN.map((task) => ({ ...task, passesNeeded: 1 })),
  };
}

export function currentTask(state: MasteryQueueState): MasteryTask | null {
  return state.queue.length > 0 ? state.queue[0] : null;
}

export function isComplete(state: MasteryQueueState): boolean {
  return state.queue.length === 0;
}

/** True when the current task previously failed and is being redeemed. */
export function isRedeeming(state: MasteryQueueState): boolean {
  const task = currentTask(state);
  return task !== null && task.passesNeeded > 1;
}

/**
 * Total tasks in the initial plan — used with `remainingPasses` to show
 * progress. Redemptions can push remaining work back up; the UI should
 * clamp its progress bar so it never moves backwards jarringly.
 */
export function totalPlannedTasks(): number {
  return INITIAL_TASK_PLAN.length;
}

/** Sum of passes still owed across the whole queue. */
export function remainingPasses(state: MasteryQueueState): number {
  return state.queue.reduce((sum, task) => sum + task.passesNeeded, 0);
}

/**
 * Record a pass on the current task.
 * Throws if the queue is already empty — callers must check `isComplete`.
 */
export function passCurrent(state: MasteryQueueState): MasteryQueueState {
  const [head, ...rest] = state.queue;
  if (!head) {
    throw new Error("passCurrent called on an empty mastery queue");
  }
  const passesNeeded = head.passesNeeded - 1;
  if (passesNeeded <= 0) {
    return { queue: rest };
  }
  // Redemption passes must be consecutive: keep the task at the head.
  return { queue: [{ ...head, passesNeeded }, ...rest] };
}

/**
 * Record a fail on the current task: it goes to the back of the queue and
 * now owes REDEMPTION_PASSES consecutive passes.
 * Throws if the queue is already empty — callers must check `isComplete`.
 */
export function failCurrent(state: MasteryQueueState): MasteryQueueState {
  const [head, ...rest] = state.queue;
  if (!head) {
    throw new Error("failCurrent called on an empty mastery queue");
  }
  return { queue: [...rest, { ...head, passesNeeded: REDEMPTION_PASSES }] };
}
