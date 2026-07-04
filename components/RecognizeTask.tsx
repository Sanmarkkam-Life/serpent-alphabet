"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/types";

/**
 * Recognize task — "Which one is அ (Ah!)?"
 * A 2x2 grid of large glyph cards; the first tap decides. The parent
 * LessonRunner remounts this component with a fresh key on every
 * presentation, so the shuffle-in-useState runs anew each time.
 */
export interface TaskComponentProps {
  lesson: Lesson;
  onPass: () => void;
  onFail: () => void;
  isRedeeming: boolean;
}

/** How long the success flash shows before the parent is notified. */
const PASS_DELAY_MS = 500;
/** How long the gentle-correction moment shows before onFail. */
const FAIL_DELAY_MS = 700;

type Outcome = "idle" | "correct" | "wrong";

/** Fisher–Yates shuffle; returns a new array, never mutates the input. */
function shuffle(items: readonly string[]): string[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export default function RecognizeTask({
  lesson,
  onPass,
  onFail,
  isRedeeming,
}: TaskComponentProps) {
  // Shuffled exactly ONCE per mount (fresh key per presentation = fresh order).
  const [options] = useState<string[]>(() =>
    shuffle([lesson.glyph, ...lesson.distractors]),
  );
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [tappedIndex, setTappedIndex] = useState<number | null>(null);

  const timerRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const decided = outcome !== "idle";
  const correctIndex = options.indexOf(lesson.glyph);

  const handleTap = (index: number): void => {
    if (decided || resolvedRef.current) return;
    const isCorrect = options[index] === lesson.glyph;
    setTappedIndex(index);
    setOutcome(isCorrect ? "correct" : "wrong");
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        if (isCorrect) {
          onPass();
        } else {
          onFail();
        }
      },
      isCorrect ? PASS_DELAY_MS : FAIL_DELAY_MS,
    );
  };

  const cardClasses = (index: number): string => {
    const base =
      "relative flex min-h-[120px] items-center justify-center rounded-blob shadow-leaf transition-all duration-150";
    if (!decided) {
      return `${base} bg-cream-soft active:scale-95`;
    }
    const isTapped = index === tappedIndex;
    if (outcome === "correct") {
      return isTapped
        ? `${base} bg-sage-300 ring-4 ring-forest`
        : `${base} bg-cream-soft opacity-50`;
    }
    // Wrong answer: wiggle the tapped card, softly reveal the right one.
    if (isTapped) {
      return `${base} animate-wiggle bg-sage-200 opacity-80`;
    }
    if (index === correctIndex) {
      return `${base} bg-cream-soft ring-4 ring-serpent-soft`;
    }
    return `${base} bg-cream-soft opacity-50`;
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <h2 className="text-center font-ui text-2xl font-bold text-forest">
        Which one is <span className="font-tamil">{lesson.glyph}</span> (
        {lesson.phonetic})?
      </h2>

      {isRedeeming && (
        <p className="mt-2 text-center font-ui text-sm font-semibold text-wisdom-deep">
          Two clean answers in a row clears it!
        </p>
      )}

      <div
        role="group"
        aria-label="Letter choices"
        className="mt-6 grid grid-cols-2 gap-4"
      >
        {options.map((glyph, index) => (
          <button
            key={`${glyph}-${index}`}
            type="button"
            disabled={decided}
            aria-label={`Tamil letter option ${glyph}`}
            onClick={() => handleTap(index)}
            className={cardClasses(index)}
          >
            <span
              aria-hidden="true"
              className="select-none font-tamil text-7xl font-bold leading-none text-forest"
            >
              {glyph}
            </span>
            {outcome === "correct" && index === tappedIndex && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-3 flex h-8 w-8 animate-pop-in items-center justify-center rounded-full bg-forest text-lg font-bold text-cream"
              >
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
