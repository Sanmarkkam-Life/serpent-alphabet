"use client";

import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/types";
import { audioFileExists } from "@/lib/audio";

/**
 * Recognize task: "Which is the correct one?"
 * The cue is the SOUND (speaker button + phonetic text). The target glyph
 * must never appear in the question, or it would give the answer away.
 * A 2x2 grid of large glyph cards; the first tap decides. The parent
 * LessonRunner remounts this component with a fresh key on every
 * presentation, so the shuffle-in-useState runs anew each time.
 */
export interface TaskComponentProps {
  lesson: Lesson;
  /** Called on a correct pick with the seconds taken (for the time bonus). */
  onPass: (elapsedSeconds?: number) => void;
  onFail: () => void;
  isRedeeming: boolean;
}

/** How long the success flash shows before the parent is notified. */
const PASS_DELAY_MS = 500;
/** How long the gentle-correction moment shows before onFail. */
const FAIL_DELAY_MS = 700;

type Outcome = "idle" | "correct" | "wrong";
type CueAudio = "checking" | "available" | "missing";

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
  const [cueAudio, setCueAudio] = useState<CueAudio>("checking");
  const [cuePlaying, setCuePlaying] = useState(false);

  const timerRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mountedRef = useRef(true);
  /** The answer clock starts when the question appears. */
  const shownAtRef = useRef<number>(performance.now());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      audioRef.current?.pause();
    };
  }, []);

  // Does the reference audio actually exist? (Missing files never crash.)
  useEffect(() => {
    let cancelled = false;
    audioFileExists(lesson.audio).then((exists) => {
      if (!cancelled && mountedRef.current) {
        setCueAudio(exists ? "available" : "missing");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lesson.audio]);

  /**
   * Play the reference pronunciation. This is core learning content: it is
   * deliberately NOT affected by the SFX mute toggle.
   */
  const playCue = (): void => {
    let element = audioRef.current;
    if (!element) {
      element = new Audio(lesson.audio);
      element.preload = "auto";
      element.onended = () => {
        if (mountedRef.current) setCuePlaying(false);
      };
      element.onerror = () => {
        if (mountedRef.current) {
          setCueAudio("missing");
          setCuePlaying(false);
        }
      };
      audioRef.current = element;
    }
    element.currentTime = 0;
    element.play().then(
      () => {
        if (mountedRef.current) setCuePlaying(true);
      },
      () => {
        if (mountedRef.current) setCueAudio("missing");
      },
    );
  };

  const decided = outcome !== "idle";
  const correctIndex = options.indexOf(lesson.glyph);

  const handleTap = (index: number): void => {
    if (decided || resolvedRef.current) return;
    const isCorrect = options[index] === lesson.glyph;
    const elapsedSeconds = (performance.now() - shownAtRef.current) / 1000;
    setTappedIndex(index);
    setOutcome(isCorrect ? "correct" : "wrong");
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        if (resolvedRef.current) return;
        resolvedRef.current = true;
        if (isCorrect) {
          onPass(elapsedSeconds);
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
        Which is the correct one?
      </h2>

      {/* The cue is the sound, never the glyph. */}
      <div className="mt-3 flex items-center justify-center gap-3">
        {cueAudio === "available" && (
          <button
            type="button"
            onClick={playCue}
            aria-label={`Play the sound ${lesson.phonetic}`}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-serpent text-2xl text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none"
          >
            {cuePlaying && (
              <span
                className="absolute inset-0 animate-ping rounded-full bg-serpent-soft opacity-70"
                aria-hidden="true"
              />
            )}
            <span className="relative" aria-hidden="true">
              🔊
            </span>
          </button>
        )}
        <span className="font-ui text-2xl font-extrabold text-serpent-deep">
          {lesson.phonetic}
        </span>
      </div>

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
