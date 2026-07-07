"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Celebration, { type LessonSummary } from "@/components/Celebration";
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
import { levelUpBetween } from "@/lib/levels";
import {
  addXp,
  bumpFlawlessStreak,
  isLessonComplete,
  loadProgress,
  markLessonComplete,
  recordTaskActivity,
  resetFlawlessStreak,
  setMute,
} from "@/lib/progress";
import { getStreakMultiplier } from "@/lib/streak";
import { feedbackFail, feedbackFanfare, feedbackPass } from "@/lib/sfx";
import {
  COMBO_START,
  REVIEW_XP_RATE,
  TEST_OUT_COMBO,
  ZERO_XP,
  addTaskXp,
  comboAfterFail,
  comboAfterPass,
  scaleTaskXp,
  taskXp,
  testOutXp,
  type TaskXp,
} from "@/lib/xp";
import type { Lesson, MasteryTask, TaskType } from "@/lib/types";

/**
 * The heart of the app: drives the pure mastery queue, remounts each task
 * with a fresh key on every presentation, shows a gentle fail interstitial,
 * and celebrates when the queue runs empty.
 *
 * v2 adds XP/combo tracking, a review variant for completed lessons
 * (half XP, no effect on unlocks), and a two-task test-out challenge.
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

type View = "task" | "fail" | "testout" | "testout-miss" | "celebrate";
type Mode = "normal" | "review";
type TestOutStep = "trace" | "recognize";

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

function testOutSessionKey(lessonId: string): string {
  return `serpent_testout_dismissed_${lessonId}`;
}

export default function LessonRunner({ lesson, nextLesson }: LessonRunnerProps) {
  const [queueState, setQueueState] = useState<MasteryQueueState>(() =>
    createInitialState(),
  );
  const [view, setView] = useState<View>("task");
  const [mode, setMode] = useState<Mode>("normal");
  /** Increments on every pass/fail so the task key changes each presentation. */
  const [attempt, setAttempt] = useState(0);
  /** Highest remaining-pass count ever seen; keeps the progress bar sane. */
  const [maxRemaining, setMaxRemaining] = useState<number>(() =>
    remainingPasses(createInitialState()),
  );
  const [failedType, setFailedType] = useState<TaskType | null>(null);

  // Gamification state
  const [combo, setCombo] = useState(COMBO_START);
  const [bestCombo, setBestCombo] = useState(COMBO_START);
  const [lessonXp, setLessonXp] = useState<TaskXp>(ZERO_XP);
  const [xpAtStart, setXpAtStart] = useState(0);
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [muted, setMuted] = useState(false);

  // Global flawless streak (persistent across lessons/sessions).
  const [flawlessStreak, setFlawlessStreak] = useState(0);
  const [streakResetFlash, setStreakResetFlash] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Test-out state
  const [testOutAllowed, setTestOutAllowed] = useState(false);
  const [testOutStep, setTestOutStep] = useState<TestOutStep>("trace");
  const [testOutTraceElapsed, setTestOutTraceElapsed] = useState<number | null>(
    null,
  );

  // Client-only setup: review detection, test-out eligibility, mute state.
  // The first render matches SSR (normal mode, no test-out button).
  useEffect(() => {
    const progress = loadProgress();
    const completed = isLessonComplete(progress, lesson.id);
    setMode(completed ? "review" : "normal");
    setXpAtStart(progress.xp);
    setMuted(progress.mute);
    setFlawlessStreak(progress.flawlessStreak);
    let dismissed = false;
    try {
      dismissed =
        window.sessionStorage.getItem(testOutSessionKey(lesson.id)) === "1";
    } catch {
      // sessionStorage unavailable: just skip the shortcut.
    }
    setTestOutAllowed(!completed && !dismissed);
  }, [lesson.id]);

  const task = currentTask(queueState);
  const redeeming = isRedeeming(queueState);

  const remaining = remainingPasses(queueState);
  const progressFraction =
    maxRemaining > 0
      ? Math.min(1, Math.max(0, 1 - remaining / maxRemaining))
      : 1;

  // Flawless streak helpers: bump on a clean pass, break on any mistake.
  const bumpStreak = (): number => {
    const next = bumpFlawlessStreak();
    setFlawlessStreak(next.flawlessStreak);
    return next.flawlessStreak;
  };

  const breakStreak = (): void => {
    resetFlawlessStreak();
    setFlawlessStreak(0);
    setStreakResetFlash(true);
    if (flashTimeoutRef.current !== null) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setStreakResetFlash(false), 900);
  };

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  /**
   * Apply the flawless-streak multiplier to the lesson total, bank the bonus
   * XP, and build the celebration summary.
   */
  const summarize = (
    finalXp: TaskXp,
    finalBestCombo: number,
    streakForBonus: number,
    flavor: LessonSummary["flavor"],
  ): LessonSummary => {
    const streakMultiplier = getStreakMultiplier(streakForBonus);
    const bonus = Math.round(finalXp.total * (streakMultiplier - 1));
    if (bonus > 0) addXp(bonus);
    const totalAfter = loadProgress().xp;
    return {
      xp: finalXp,
      bestCombo: finalBestCombo,
      levelUp: levelUpBetween(xpAtStart, totalAfter),
      flavor,
      streakMultiplier,
      flawlessStreak: streakForBonus,
      finalTotal: finalXp.total + bonus,
    };
  };

  const finishLesson = (
    finalXp: TaskXp,
    finalBestCombo: number,
    streakForBonus: number,
  ): void => {
    if (mode === "normal") markLessonComplete(lesson.id);
    feedbackFanfare();
    setSummary(
      summarize(
        finalXp,
        finalBestCombo,
        streakForBonus,
        mode === "review" ? "review" : "normal",
      ),
    );
    setView("celebrate");
  };

  const handlePass = (elapsedSeconds?: number): void => {
    if (view !== "task" || isComplete(queueState)) return;
    const current = currentTask(queueState);
    if (!current) return;

    // XP for this pass, at the combo in effect when it was passed.
    let earned = taskXp(
      current.type,
      combo,
      elapsedSeconds ?? null,
      lesson.trace_time_limit,
    );
    if (mode === "review") earned = scaleTaskXp(earned, REVIEW_XP_RATE);
    if (earned.total > 0) addXp(earned.total);
    const lessonXpNext = addTaskXp(lessonXp, earned);
    setLessonXp(lessonXpNext);

    const comboNext = comboAfterPass(combo);
    setCombo(comboNext);
    const bestComboNext = Math.max(bestCombo, comboNext);
    setBestCombo(bestComboNext);

    // Every clean pass grows the persistent flawless streak.
    const streakNext = bumpStreak();

    recordTaskActivity();
    feedbackPass();

    const next = passCurrent(queueState);
    setQueueState(next);
    setAttempt((count) => count + 1);
    setMaxRemaining((max) => Math.max(max, remainingPasses(next)));
    if (isComplete(next)) {
      finishLesson(lessonXpNext, bestComboNext, streakNext);
    }
  };

  const handleFail = (): void => {
    if (view !== "task" || isComplete(queueState)) return;
    setFailedType(currentTask(queueState)?.type ?? null);
    setCombo(comboAfterFail());
    breakStreak();
    feedbackFail();
    const next = failCurrent(queueState);
    setQueueState(next);
    setAttempt((count) => count + 1);
    setMaxRemaining((max) => Math.max(max, remainingPasses(next)));
    setView("fail");
  };

  /* ---------------- Test-out ("I already know this") ----------------- */

  const startTestOut = (): void => {
    setTestOutStep("trace");
    setTestOutTraceElapsed(null);
    setView("testout");
  };

  const dismissTestOut = (): void => {
    setTestOutAllowed(false);
    try {
      window.sessionStorage.setItem(testOutSessionKey(lesson.id), "1");
    } catch {
      // sessionStorage unavailable: state flag alone hides it this mount.
    }
  };

  const handleTestOutPass = (
    step: TestOutStep,
    elapsedSeconds?: number,
  ): void => {
    if (view !== "testout") return;
    feedbackPass();
    recordTaskActivity();
    const streakNext = bumpStreak();
    if (step === "trace") {
      setTestOutTraceElapsed(elapsedSeconds ?? null);
      setTestOutStep("recognize");
      return;
    }
    // Both passed, first try: full clean-pass reward.
    const earned = testOutXp({
      traceElapsedSeconds: testOutTraceElapsed,
      recognizeElapsedSeconds: elapsedSeconds ?? null,
      traceTimeLimit: lesson.trace_time_limit,
    });
    addXp(earned.total);
    setLessonXp(earned);
    markLessonComplete(lesson.id);
    feedbackFanfare();
    setSummary(summarize(earned, TEST_OUT_COMBO, streakNext, "testout"));
    setView("celebrate");
  };

  const handleTestOutFail = (): void => {
    if (view !== "testout") return;
    breakStreak();
    feedbackFail();
    dismissTestOut();
    setView("testout-miss");
  };

  const resumeFullLesson = (): void => {
    setQueueState(createInitialState());
    setCombo(COMBO_START);
    setBestCombo(COMBO_START);
    setLessonXp(ZERO_XP);
    setAttempt((count) => count + 1);
    setMaxRemaining(remainingPasses(createInitialState()));
    setView("task");
  };

  const toggleMute = (): void => {
    const next = setMute(!muted);
    setMuted(next.mute);
  };

  if (view === "celebrate" && summary !== null) {
    return (
      <Celebration lesson={lesson} nextLesson={nextLesson} summary={summary} />
    );
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

  const showTestOutButton =
    view === "task" &&
    mode === "normal" &&
    testOutAllowed &&
    attempt === 0 &&
    task?.type === "learn";

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <header className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pb-2 pt-4">
        <Link
          href="/"
          className="flex min-h-[48px] items-center gap-1 rounded-blob pr-1 font-ui text-base font-bold text-forest"
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

        {mode === "review" && (
          <span className="rounded-full bg-wisdom-soft px-2.5 py-1 font-ui text-xs font-extrabold tracking-wide text-wisdom-deep">
            REVIEW
          </span>
        )}

        <div
          className="h-3 min-w-6 flex-1 overflow-hidden rounded-full bg-sage-200"
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressFraction * 100)}
        >
          <div
            className="h-full rounded-full bg-serpent transition-all duration-500 ease-out"
            style={{ width: `${progressFraction * 100}%` }}
          />
        </div>

        {/* Flawless streak: always visible while it is running (⚡ N). It
            flashes red at 0 on a mistake, then hides. */}
        {(flawlessStreak >= 1 || streakResetFlash) && (
          <span
            key={`streak-${streakResetFlash ? "reset" : flawlessStreak}`}
            className={`animate-pop-in whitespace-nowrap rounded-full px-2.5 py-1 font-ui text-sm font-extrabold ${
              streakResetFlash
                ? "bg-red-100 text-red-600"
                : "bg-serpent-soft text-forest-deep"
            }`}
            aria-label={`Flawless streak: ${streakResetFlash ? 0 : flawlessStreak}`}
          >
            ⚡ {streakResetFlash ? 0 : flawlessStreak}
          </span>
        )}

        {/* Live lesson XP; remounts on change for a subtle pulse. */}
        <span
          key={lessonXp.total}
          className="animate-pop-in whitespace-nowrap rounded-full bg-sage-100 px-2.5 py-1 font-ui text-sm font-extrabold text-forest"
          aria-label={`${lessonXp.total} XP earned this lesson`}
        >
          {lessonXp.total} XP
        </span>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute effects" : "Mute effects"}
          title={muted ? "Unmute effects" : "Mute effects"}
          className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
        >
          <span aria-hidden="true">{muted ? "🔇" : "🔉"}</span>
        </button>
      </header>

      {view === "fail" && (
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
          <Button variant="primary" fullWidth onClick={() => setView("task")}>
            Keep going
          </Button>
        </main>
      )}

      {view === "testout-miss" && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 pb-10 text-center">
          <span className="text-7xl" aria-hidden="true">
            🐍
          </span>
          <h1 className="text-balance font-ui text-2xl font-extrabold text-forest">
            Almost! Let&apos;s make it stick properly.
          </h1>
          <p className="text-balance font-ui text-base leading-relaxed text-forest-soft">
            We&apos;ll walk the whole path for this letter together.
          </p>
          <Button variant="primary" fullWidth onClick={resumeFullLesson}>
            Start the lesson
          </Button>
        </main>
      )}

      {view === "testout" && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full border border-sage-300 bg-sage-100 px-4 py-1.5 font-ui text-sm font-bold text-forest">
              Test-out: {testOutStep === "trace" ? "1" : "2"} of 2
            </span>
          </div>
          {testOutStep === "trace" ? (
            <TraceTask
              key={`testout-trace-${attempt}`}
              lesson={lesson}
              onPass={(elapsed) => handleTestOutPass("trace", elapsed)}
              onFail={handleTestOutFail}
              isRedeeming={false}
            />
          ) : (
            <RecognizeTask
              key={`testout-recognize-${attempt}`}
              lesson={lesson}
              onPass={(elapsed) => handleTestOutPass("recognize", elapsed)}
              onFail={handleTestOutFail}
              isRedeeming={false}
            />
          )}
        </main>
      )}

      {view === "task" && task !== null && (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
          {redeeming && (
            <div className="mb-3 flex justify-center">
              <span className="inline-flex items-center gap-1 rounded-full border border-wisdom bg-wisdom-soft px-4 py-1.5 font-ui text-sm font-bold text-wisdom-deep">
                Redemption: pass twice in a row!
              </span>
            </div>
          )}
          {renderTask(task)}
          {showTestOutButton && (
            <button
              type="button"
              onClick={startTestOut}
              className="mx-auto mt-4 flex min-h-[48px] items-center justify-center px-4 font-ui text-base font-semibold text-forest-soft underline underline-offset-4"
            >
              I already know this letter
            </button>
          )}
        </main>
      )}
    </div>
  );
}
