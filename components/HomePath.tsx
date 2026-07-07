"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { levelForXp } from "@/lib/levels";
import {
  defaultProgress,
  isLessonComplete,
  isLessonUnlocked,
  loadProgress,
  setMute,
  type Progress,
} from "@/lib/progress";

/**
 * The winding jungle trail of lesson nodes on the home screen.
 * Progress lives in localStorage, so it is only read after mount —
 * the server and the first client render both show the default state
 * (nothing completed, only lesson 1 unlocked) to avoid hydration drift.
 */

export interface HomePathLesson {
  id: string;
  order: number;
  glyph: string;
  phonetic: string;
}

export interface HomePathProps {
  /** All lessons, already sorted by `order`. */
  lessons: HomePathLesson[];
}

type Slot = "left" | "center" | "right";
type NodeStatus = "completed" | "unlocked" | "locked";

/** Winding order down the page: centre → right → centre → left → repeat. */
const SLOT_CYCLE: readonly Slot[] = ["center", "right", "center", "left"];

/** Horizontal position of a node's centre, as a fraction of path width. */
const SLOT_FRACTION: Record<Slot, number> = {
  left: 0.25,
  center: 0.5,
  right: 0.75,
};

/** Connector viewBox roughly matches the ~390px design width so the
 *  dotted stroke is not visibly distorted by preserveAspectRatio="none". */
const CONNECTOR_WIDTH = 390;
const CONNECTOR_HEIGHT = 48;

function slotAt(index: number): Slot {
  return SLOT_CYCLE[index % SLOT_CYCLE.length] ?? "center";
}

/** Dotted S-curve joining two consecutive nodes — the snake's trail. */
function Connector({ from, to }: { from: Slot; to: Slot }) {
  const x1 = SLOT_FRACTION[from] * CONNECTOR_WIDTH;
  const x2 = SLOT_FRACTION[to] * CONNECTOR_WIDTH;
  const midY = CONNECTOR_HEIGHT / 2;
  return (
    <svg
      viewBox={`0 0 ${CONNECTOR_WIDTH} ${CONNECTOR_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-12 w-full"
      aria-hidden="true"
    >
      <path
        d={`M ${x1} 2 C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${CONNECTOR_HEIGHT - 2}`}
        fill="none"
        stroke="#A8C5A0"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="0.5 13"
      />
    </svg>
  );
}

const CIRCLE_BASE =
  "relative flex h-[84px] w-[84px] items-center justify-center rounded-full font-tamil text-4xl font-bold transition-transform";

const CIRCLE_BY_STATUS: Record<NodeStatus, string> = {
  completed: "bg-forest text-white shadow-leaf active:scale-95",
  unlocked: "bg-serpent text-forest-deep shadow-node animate-wiggle active:scale-95",
  locked: "bg-sage-200 text-sage-400 opacity-60",
};

const LABEL_BY_STATUS: Record<NodeStatus, string> = {
  completed: "text-forest",
  unlocked: "text-forest",
  locked: "text-sage-400 opacity-70",
};

function LessonNode({
  lesson,
  status,
}: {
  lesson: HomePathLesson;
  status: NodeStatus;
}) {
  const circle = (
    <span className={`${CIRCLE_BASE} ${CIRCLE_BY_STATUS[status]}`}>
      <span aria-hidden="true">{lesson.glyph}</span>
      {status === "completed" && (
        <span
          className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-wisdom font-ui text-sm font-bold text-white ring-2 ring-cream"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
      {status === "locked" && (
        <span
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-sage-100 text-xs ring-2 ring-cream"
          aria-hidden="true"
        >
          🔒
        </span>
      )}
    </span>
  );

  const label = (
    <span
      className={`mt-1.5 text-center font-ui text-sm font-bold ${LABEL_BY_STATUS[status]}`}
      aria-hidden="true"
    >
      {lesson.phonetic}
    </span>
  );

  if (status === "locked") {
    return (
      <div className="flex w-28 flex-col items-center" aria-disabled="true">
        {circle}
        {label}
        <span className="sr-only">
          Lesson {lesson.order}, {lesson.phonetic}. Locked: finish the step
          before it to open it.
        </span>
      </div>
    );
  }

  return (
    <Link
      href={`/lesson/${lesson.id}`}
      className="flex w-28 flex-col items-center"
      aria-label={
        status === "completed"
          ? `Lesson ${lesson.order}, ${lesson.phonetic}. Completed, tap to review.`
          : `Lesson ${lesson.order}, ${lesson.phonetic}. Start this lesson.`
      }
    >
      {circle}
      {label}
    </Link>
  );
}

/** A gold wisdom badge (book / lamp) used by both intro nodes. */
function IntroBadge({
  icon,
  viewed,
  wiggle,
  locked,
}: {
  icon: string;
  viewed: boolean;
  wiggle: boolean;
  locked?: boolean;
}) {
  return (
    <span
      className={`relative flex h-[84px] w-[84px] items-center justify-center rounded-full border-2 text-4xl shadow-leaf transition-transform active:scale-95 ${
        locked
          ? "border-sage-300 bg-sage-100 opacity-60"
          : "border-wisdom bg-wisdom-soft"
      } ${wiggle ? "animate-wiggle" : ""}`}
    >
      <span aria-hidden="true">{icon}</span>
      {viewed && (
        <span
          className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-wisdom font-ui text-sm font-bold text-white ring-2 ring-cream"
          aria-hidden="true"
        >
          ✓
        </span>
      )}
      {locked && (
        <span
          className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-sage-100 text-xs ring-2 ring-cream"
          aria-hidden="true"
        >
          🔒
        </span>
      )}
    </span>
  );
}

function IntroNodeLabel({ text }: { text: string }) {
  return (
    <span
      className="mt-1.5 text-center font-ui text-sm font-bold text-wisdom-deep"
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

/**
 * "About Tamil" intro node: leads the whole path, always tappable. Viewing
 * it unlocks the Soul Letters intro.
 */
function TamilIntroNode({ viewed }: { viewed: boolean }) {
  return (
    <Link
      href="/about"
      className="flex w-32 flex-col items-center"
      aria-label={
        viewed
          ? "About Tamil. Read again."
          : "About Tamil. Start here to begin the path."
      }
    >
      <IntroBadge icon="📖" viewed={viewed} wiggle={!viewed} />
      <IntroNodeLabel text="About Tamil" />
    </Link>
  );
}

/**
 * "The Soul Letters" intro node. Locked until the Tamil intro is viewed;
 * once unlocked it is tappable and viewing it unlocks the first lesson.
 */
function SoulLettersNode({
  unlocked,
  viewed,
}: {
  unlocked: boolean;
  viewed: boolean;
}) {
  if (!unlocked) {
    return (
      <div className="flex w-32 flex-col items-center" aria-disabled="true">
        <IntroBadge icon="🪔" viewed={false} wiggle={false} locked />
        <IntroNodeLabel text="The Soul Letters" />
        <span className="sr-only">
          The Soul Letters. Locked: read About Tamil first.
        </span>
      </div>
    );
  }
  return (
    <Link
      href="/intro"
      className="flex w-32 flex-col items-center"
      aria-label={
        viewed
          ? "The Soul Letters. Read again."
          : "The Soul Letters. Open the first letter."
      }
    >
      <IntroBadge icon="🪔" viewed={viewed} wiggle={!viewed} />
      <IntroNodeLabel text="The Soul Letters" />
    </Link>
  );
}

export default function HomePath({ lessons }: HomePathProps) {
  // Default (server-matching) state: no progress yet.
  const [progress, setProgress] = useState<Progress>(defaultProgress());

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const orderedIds = lessons.map((lesson) => lesson.id);
  const level = levelForXp(progress.xp);

  const toggleMute = (): void => {
    setProgress(setMute(!progress.mute));
  };

  function statusFor(lessonId: string): NodeStatus {
    if (isLessonComplete(progress, lessonId)) return "completed";
    if (isLessonUnlocked(progress, orderedIds, lessonId)) return "unlocked";
    return "locked";
  }

  // Two intro nodes lead the path (slots 0 and 1); lessons start at slot 2.
  const tamilSlot = slotAt(0);
  const soulSlot = slotAt(1);
  const tailSlot = slotAt(lessons.length + 2);

  return (
    <div className="relative">
      {/* Snake stats: level badge, lifetime XP, quiet streak, mute. */}
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-3.5 py-2 font-ui text-sm font-extrabold text-forest"
          aria-label={`Level: ${level.name}`}
        >
          <span aria-hidden="true">{level.emoji}</span>
          {level.name}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-3.5 py-2 font-ui text-sm font-extrabold text-forest">
          {progress.xp} XP
        </span>
        {progress.flawlessStreak >= 1 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-serpent-soft px-3.5 py-2 font-ui text-sm font-extrabold text-forest-deep"
            aria-label={`Flawless streak: ${progress.flawlessStreak}`}
          >
            ⚡ {progress.flawlessStreak}
          </span>
        )}
        {progress.streakCount >= 2 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-serpent-soft px-3.5 py-2 font-ui text-sm font-extrabold text-forest-deep"
            aria-label={`${progress.streakCount} day streak`}
          >
            🔥 {progress.streakCount}
          </span>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={progress.mute ? "Unmute effects" : "Mute effects"}
          title={progress.mute ? "Unmute effects" : "Mute effects"}
          className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
        >
          <span aria-hidden="true">{progress.mute ? "🔇" : "🔉"}</span>
        </button>
      </div>
      {/* The About Tamil intro leads the trail. */}
      <div className="relative h-[116px]">
        <div
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${SLOT_FRACTION[tamilSlot] * 100}%` }}
        >
          <TamilIntroNode viewed={progress.tamilIntroViewed} />
        </div>
      </div>

      {/* Then the Soul Letters intro (locked until About Tamil is viewed). */}
      <Connector from={tamilSlot} to={soulSlot} />
      <div className="relative h-[116px]">
        <div
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${SLOT_FRACTION[soulSlot] * 100}%` }}
        >
          <SoulLettersNode
            unlocked={progress.tamilIntroViewed}
            viewed={progress.introViewed}
          />
        </div>
      </div>

      {lessons.map((lesson, index) => {
        const slot = slotAt(index + 2);
        return (
          <div key={lesson.id}>
            <Connector from={slotAt(index + 1)} to={slot} />
            <div className="relative h-[116px]">
              <div
                className="absolute top-0 -translate-x-1/2"
                style={{ left: `${SLOT_FRACTION[slot] * 100}%` }}
              >
                <LessonNode lesson={lesson} status={statusFor(lesson.id)} />
              </div>
            </div>
          </div>
        );
      })}

      {/* The trail keeps going: more letters are hatching. */}
      {lessons.length > 0 && (
        <div>
          <Connector from={slotAt(lessons.length + 1)} to={tailSlot} />
          <div className="relative h-[124px]">
            <div
              className="absolute top-0 flex w-36 -translate-x-1/2 flex-col items-center"
              style={{ left: `${SLOT_FRACTION[tailSlot] * 100}%` }}
            >
              <span
                className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-2 border-dashed border-sage-300 bg-cream-soft text-3xl opacity-60"
                aria-hidden="true"
              >
                🥚
              </span>
              <span className="mt-1.5 text-center font-ui text-xs font-semibold text-sage-400">
                more letters on the way…
              </span>
            </div>
          </div>
        </div>
      )}

      {lessons.length === 0 && (
        <p className="py-10 text-center font-ui text-sm font-semibold text-sage-500">
          No lessons yet. The snake is still gathering letters.
        </p>
      )}
    </div>
  );
}
