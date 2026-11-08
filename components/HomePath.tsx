"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { levelForXp } from "@/lib/levels";
import {
  defaultProgress,
  isLessonComplete,
  isLessonUnlocked,
  runDailyRollover,
  setMute,
  type Progress,
} from "@/lib/progress";
import { VOWEL_IDS, isConsonantId, isVowelId } from "@/lib/sections";

/**
 * The winding jungle trail of lesson nodes on the home screen.
 * Progress lives in localStorage, so it is only read after mount —
 * the server and the first client render both show the default state
 * (nothing completed, only lesson 1 unlocked) to avoid hydration drift.
 *
 * v6 groups the trail into labelled sections (About, Vowels, Consonants) with
 * a Body Letters intro leading the consonants, and scrolls the learner to
 * their current node instead of the top of a now-long path.
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

/** A gold wisdom badge (book / lamp / lotus) used by the intro nodes. */
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
      {!viewed && (
        <span
          className="mt-1 rounded-full bg-serpent px-2.5 py-0.5 font-ui text-xs font-extrabold text-forest-deep"
          aria-hidden="true"
        >
          Start here
        </span>
      )}
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

/**
 * "The Body Letters" intro node, leading the consonants. Locked until every
 * vowel is complete; viewing it unlocks the first consonant.
 */
function BodyLettersNode({
  unlocked,
  viewed,
}: {
  unlocked: boolean;
  viewed: boolean;
}) {
  if (!unlocked) {
    return (
      <div className="flex w-32 flex-col items-center" aria-disabled="true">
        <IntroBadge icon="🪷" viewed={false} wiggle={false} locked />
        <IntroNodeLabel text="The Body Letters" />
        <span className="sr-only">
          The Body Letters. Locked: finish every vowel first.
        </span>
      </div>
    );
  }
  return (
    <Link
      href="/body"
      className="flex w-32 flex-col items-center"
      aria-label={
        viewed
          ? "The Body Letters. Read again."
          : "The Body Letters. Open the first consonant."
      }
    >
      <IntroBadge icon="🪷" viewed={viewed} wiggle={!viewed} />
      <IntroNodeLabel text="The Body Letters" />
    </Link>
  );
}

/** A labelled divider that opens a section of the trail. */
function SectionLabel({ text, tamil }: { text: string; tamil?: string }) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-sage-300" aria-hidden="true" />
      <h2 className="font-ui text-xs font-extrabold uppercase tracking-widest text-forest-soft">
        {text}
        {tamil && (
          <span className="ml-1.5 font-tamil text-sm normal-case text-forest">
            {tamil}
          </span>
        )}
      </h2>
      <span className="h-px flex-1 bg-sage-300" aria-hidden="true" />
    </div>
  );
}

interface TrailNode {
  key: string;
  el: React.ReactNode;
}

interface TrailSection {
  label: string;
  tamil?: string;
  nodes: TrailNode[];
}

export default function HomePath({ lessons }: HomePathProps) {
  // Default (server-matching) state: no progress yet.
  const [progress, setProgress] = useState<Progress>(defaultProgress());
  const [dailyShieldSaved, setDailyShieldSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const currentNodeRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    // Opening the app is where a missed day is settled: a daily shield can
    // absorb it and keep the 🔥 streak alive. Reassure the learner if it did.
    const { progress: current, dailyShieldUsed } = runDailyRollover();
    setProgress(current);
    if (dailyShieldUsed) setDailyShieldSaved(true);
    setLoaded(true);
  }, []);

  const orderedIds = lessons.map((lesson) => lesson.id);
  const level = levelForXp(progress.xp);
  const { streakCount, flawlessStreak, shields } = progress;

  const toggleMute = (): void => {
    setProgress(setMute(!progress.mute));
  };

  function statusFor(lessonId: string): NodeStatus {
    if (isLessonComplete(progress, lessonId)) return "completed";
    if (isLessonUnlocked(progress, orderedIds, lessonId)) return "unlocked";
    return "locked";
  }

  const allVowelsComplete = VOWEL_IDS.every((id) =>
    progress.completed.includes(id),
  );

  // The node the learner should act on next; the view scrolls to it on load.
  function computeCurrentKey(): string | null {
    if (!progress.tamilIntroViewed) return "about";
    if (!progress.introViewed) return "soul";
    for (const lesson of lessons) {
      if (!progress.completed.includes(lesson.id)) {
        if (isConsonantId(lesson.id) && !progress.bodyIntroViewed) return "body";
        return lesson.id;
      }
    }
    return null;
  }
  const currentKey = computeCurrentKey();

  useEffect(() => {
    if (!loaded || scrolledRef.current) return;
    const el = currentNodeRef.current;
    if (el) {
      scrolledRef.current = true;
      // Land near the current node rather than the top of a long path.
      el.scrollIntoView({ block: "center" });
    }
  }, [loaded]);

  const vowelLessons = lessons.filter((l) => isVowelId(l.id));
  const consonantLessons = lessons.filter((l) => isConsonantId(l.id));

  const sections: TrailSection[] = [
    {
      label: "About",
      nodes: [
        { key: "about", el: <TamilIntroNode viewed={progress.tamilIntroViewed} /> },
        {
          key: "soul",
          el: (
            <SoulLettersNode
              unlocked={progress.tamilIntroViewed}
              viewed={progress.introViewed}
            />
          ),
        },
      ],
    },
    {
      label: "Vowels",
      tamil: "உயிர்",
      nodes: vowelLessons.map((lesson) => ({
        key: lesson.id,
        el: <LessonNode lesson={lesson} status={statusFor(lesson.id)} />,
      })),
    },
    {
      label: "Consonants",
      tamil: "மெய்",
      nodes: [
        {
          key: "body",
          el: (
            <BodyLettersNode
              unlocked={allVowelsComplete}
              viewed={progress.bodyIntroViewed}
            />
          ),
        },
        ...consonantLessons.map((lesson) => ({
          key: lesson.id,
          el: <LessonNode lesson={lesson} status={statusFor(lesson.id)} />,
        })),
      ],
    },
  ];

  return (
    <div className="relative">
      {/* A daily shield saved the 🔥 streak while the learner was away. */}
      {dailyShieldSaved && (
        <div
          className="mb-4 flex items-center gap-2 rounded-2xl border-2 border-wisdom bg-wisdom-soft px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <span className="flex-1 font-ui text-sm font-bold text-wisdom-deep">
            🛡️ Daily Shield used! Your 🔥 streak is safe.
          </span>
          <button
            type="button"
            onClick={() => setDailyShieldSaved(false)}
            aria-label="Dismiss"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-wisdom-deep"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      {/* Snake stats: level, lifetime XP, both streaks, shields, mute. */}
      <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
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

        {/* Both streaks, side by side, in one cluster (each hidden at 0). */}
        {(streakCount >= 1 || flawlessStreak >= 1) && (
          <span className="inline-flex items-center gap-2.5 rounded-full bg-serpent-soft px-3.5 py-2 font-ui text-sm font-extrabold text-forest-deep">
            {streakCount >= 1 && (
              <span
                className="whitespace-nowrap"
                aria-label={`${streakCount} day streak`}
              >
                🔥 {streakCount}
              </span>
            )}
            {flawlessStreak >= 1 && (
              <span
                className="whitespace-nowrap"
                aria-label={`Flawless streak: ${flawlessStreak}`}
              >
                ⚡ {flawlessStreak}
              </span>
            )}
          </span>
        )}

        {/* Shield inventory: shown only when at least one is owned. */}
        {(shields.flawless >= 1 || shields.daily >= 1) && (
          <span className="inline-flex items-center gap-2.5 rounded-full bg-wisdom-soft px-3.5 py-2 font-ui text-sm font-extrabold text-wisdom-deep">
            {shields.flawless >= 1 && (
              <span
                className="whitespace-nowrap"
                aria-label={`Flawless shields: ${shields.flawless}`}
              >
                🛡️⚡ {shields.flawless}
              </span>
            )}
            {shields.daily >= 1 && (
              <span
                className="whitespace-nowrap"
                aria-label={`Daily shields: ${shields.daily}`}
              >
                🛡️🔥 {shields.daily}
              </span>
            )}
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

      {/* The winding trail, grouped into labelled sections. */}
      {sections.map((section) => (
        <section key={section.label} aria-label={section.label}>
          <SectionLabel text={section.label} tamil={section.tamil} />
          {section.nodes.map((node, index) => {
            const slot = slotAt(index);
            return (
              <div key={node.key}>
                {index > 0 && <Connector from={slotAt(index - 1)} to={slot} />}
                <div
                  ref={node.key === currentKey ? currentNodeRef : undefined}
                  className="relative h-[116px]"
                >
                  <div
                    className="absolute top-0 -translate-x-1/2"
                    style={{ left: `${SLOT_FRACTION[slot] * 100}%` }}
                  >
                    {node.el}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {/* The trail keeps going: more letters are hatching. */}
      {consonantLessons.length + vowelLessons.length > 0 && (
        <div>
          <Connector from="center" to="center" />
          <div className="relative h-[124px]">
            <div className="absolute top-0 left-1/2 flex w-36 -translate-x-1/2 flex-col items-center">
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
