"use client";

import Link from "next/link";
import { useState } from "react";
import Celebration from "@/components/Celebration";
import LearnTask from "@/components/LearnTask";
import PronounceTask from "@/components/PronounceTask";
import RecognizeTask from "@/components/RecognizeTask";
import TraceTask from "@/components/TraceTask";
import { Button } from "@/components/ui";
import {
  createInitialState,
  currentTask,
  failCurrent,
  isComplete,
  isRedeeming,
  passCurrent,
  remainingPasses,
  type MasteryQueueState,
} from "@/lib/masteryQueue";
import { markLessonComplete } from "@/lib/progress";
import type { Lesson, MasteryTask, TaskType } from "@/lib/types";

/**
 * The heart of the app: drives the pure mastery queue, remounts each task
 * with a fresh key on every presentation, shows a gentle fail interstitial,
 * and celebrates when the queue runs empty.
 */

export interface NextLessonSummary {
  id: string;
  glyph: string;
  phonetic: string;
}

export interface LessonRunnerProps {
  lesson: Lesson;
  nextLesson: NextLessonSummary | null;
}

type Phase = "task" | "fail" | "celebrate";

const FAIL_MESSAGES: Record<TaskType, string> = {
  learn: "Oops! The snake lost its place. One more look!",
  pronounce: "Almost! Your snake wants one more try",
  trace: "The snake slipped! Try again",
  recognize: "Not that one. Look again!",
};

const GENERIC_FAIL_MESSAGE = "Oops! The snake lost its place. One more look!";

function failMessageFor(type: TaskType | null): string {
  return type === null ? GENERIC_FAIL_MESSAGE : FAIL_MESSAGES[type];
}

export default function LessonRunner({ lesson, nextLesson }: LessonRunnerProps) {
  const [queueState, setQueueState] = useState<MasteryQueueState>(() =>
    createInitialState(),
  );
  const [phase, setPhase] = useState<Phase>("task");
  /** Increments on every pass/fail so the task key changes each presentation. */
  const [attempt, setAttempt] = useState(0);
  /** Highest remaining-pass count ever seen — keeps the progress bar sane. */
  const [maxRemaining, setMaxRemaining] = useState<number>(() =>
    remainingPasses(createInitialState()),
  );
  const [failedType, setFailedType] = useState<TaskType | null>(null);

  const task = currentTask(queueState);
  const redeeming = isRedeeming(queueState);

  const remaining = remainingPasses(queueState);
  const progress =
    maxRemaining > 0
      ? Math.min(1, Math.max(0, 1 - remaining / maxRemaining))
      : 1;

  const handlePass = (): void => {
    if (phase !== "task" || isComplete(queueState)) return;
    const next = passCurrent(queueState);
    setQueueState(next);
    setAttempt((count) => count + 1);
    setMaxRemaining((max) => Math.max(max, remainingPasses(next)));
    if (isComplete(next)) {
      markLessonComplete(lesson.id);
      setPhase("celebrate");
    }
  };

  const handleFail = (): void => {
    if (phase !== "task" || isComplete(queueState)) return;
    setFailedType(currentTask(queueState)?.type ?? null);
    const next = failCurrent(queueState);
    setQueueState(next);
    setAttempt((count) => count + 1);
    setMaxRemaining((max) => Math.max(max, remainingPasses(next)));
    setPhase("fail");
  };

  if (phase === "celebrate") {
    return <Celebration lesson={lesson} nextLesson={nextLesson} />;
  }

  const renderTask = (current: MasteryTask) => {
    const key = `${current.key}-${attempt}`;
    const shared = {
      lesson,
      onPass: handlePass,
      onFail: handleFail,
      isRedeeming: redeeming,
    };
    switch (current.type) {
      case "learn":
        return <LearnTask key={key} {...shared} />;
      case "pronounce":
        return <PronounceTask key={key} {...shared} />;
      case "trace":
        return <TraceTask key={key} {...shared} />;
      case "recognize":
        return <RecognizeTask key={key} {...shared} />;
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pb-2 pt-4">
        <Link
          href="/"
          className="flex min-h-[48px] items-center gap-1 rounded-blob pr-2 font-ui text-base font-bold text-forest"
          aria-label="Back to the path"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Path</span>
        </Link>

        <div
          className="h-3 flex-1 overflow-hidden rounded-full bg-sage-200"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <div
            className="h-full rounded-full bg-serpent transition-all duration-500 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <span
          className="font-tamil text-2xl font-bold text-forest"
          aria-hidden="true"
        >
          {lesson.glyph}
        </span>
      </header>

      {phase === "fail" ? (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 pb-10 text-center">
          <span className="animate-wiggle text-7xl" aria-hidden="true">
            🐍
          </span>
          <h1 className="text-balance font-ui text-2xl font-extrabold text-forest">
            {failMessageFor(failedType)}
          </h1>
          <p className="text-balance font-ui text-base leading-relaxed text-forest-soft">
            You&apos;ll see that one again soon. Pass it twice in a row to
            clear it.
          </p>
          <Button
            variant="primary"
            fullWidth
            onClick={() => setPhase("task")}
          >
            Keep going
          </Button>
        </main>
      ) : task !== null ? (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
          {redeeming && (
            <div className="mb-3 flex justify-center">
              <span className="inline-flex items-center gap-1 rounded-full border border-wisdom bg-wisdom-soft px-4 py-1.5 font-ui text-sm font-bold text-wisdom-deep">
                Redemption: pass twice in a row!
              </span>
            </div>
          )}
          {renderTask(task)}
        </main>
      ) : null}
    </div>
  );
}
