"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LessonImage } from "@/components/ui";
import type { SnakeLevel } from "@/lib/levels";
import type { ChestClaimResult, ShieldType } from "@/lib/progress";
import type { TaskXp } from "@/lib/xp";
import type { Lesson } from "@/lib/types";

/**
 * Full-screen celebration once the mastery queue is empty. Confetti,
 * a proud snake, the end-of-lesson XP summary, a first-completion treasure
 * chest, and a door to the next letter on the path.
 */

export interface LessonSummary {
  /** Base lesson XP (tasks + combo + time), before the streak multipliers. */
  xp: TaskXp;
  /** Highest combo multiplier reached. */
  bestCombo: number;
  /** The level newly reached at lesson end, or null. */
  levelUp: SnakeLevel | null;
  flavor: "normal" | "review" | "testout";
  /** Flawless-streak XP multiplier applied to the lesson total (>= 1.0). */
  flawlessMultiplier: number;
  /** Daily-streak XP multiplier applied to the lesson total (>= 1.0). */
  dailyMultiplier: number;
  /** Flawless streak count at lesson end. */
  flawlessStreak: number;
  /** Daily streak (days) at lesson end. */
  dailyStreak: number;
  /** Final XP after both multipliers (what was actually banked). */
  finalTotal: number;
  /** Whether to offer a first-completion treasure chest on this screen. */
  offerChest: boolean;
}

export interface CelebrationProps {
  lesson: Lesson;
  nextLesson: { id: string; glyph: string; phonetic: string } | null;
  summary: LessonSummary;
  /** Claim this lesson's chest, returning what the pick yielded. */
  onClaimShield?: (choice: ShieldType) => ChestClaimResult;
}

/** serpent / sage / wisdom / cream — the whole forest joins the party. */
const CONFETTI_COLORS = [
  "#F5A94B", // serpent
  "#E08E2B", // serpent-deep
  "#8BB080", // sage-400
  "#A8C5A0", // sage-300
  "#C9962E", // wisdom
  "#EDE4CC", // cream-deep
];

interface ConfettiPiece {
  left: string;
  delay: string;
  duration: string;
  color: string;
  size: number;
  rounded: boolean;
}

/** Deterministic spread — no Math.random, so renders are stable.
 *  Every piece finishes (fading to 0) within CONFETTI_LIFETIME_MS. */
const CONFETTI_PIECES: ConfettiPiece[] = Array.from(
  { length: 24 },
  (_, i): ConfettiPiece => ({
    left: `${(i * 37 + 7) % 100}%`,
    delay: `${((i * 5) % 6) * 0.08}s`,
    duration: `${1.8 + (i % 5) * 0.15}s`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 8 + (i % 3) * 4,
    rounded: i % 2 === 0,
  }),
);

/** The burst is over by ~2.9s; despawn the whole layer at 3s. */
const CONFETTI_LIFETIME_MS = 3000;

const PRIMARY_LINK_CLASSES =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-bold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none";

function SummaryRow({ label, value }: { label: string; value: number }) {
  if (value <= 0) return null;
  return (
    <div className="flex items-center justify-between font-ui text-sm text-forest">
      <span>{label}</span>
      <span className="font-bold">+{value} XP</span>
    </div>
  );
}

/** Trim trailing zeros so 1.50 shows as 1.5 and 1.05 stays 1.05. */
function formatMultiplier(m: number): string {
  return m.toFixed(2).replace(/\.?0+$/, "");
}

/** A streak-multiplier line (shown only when the multiplier is above 1.0). */
function MultiplierRow({ label, multiplier }: { label: string; multiplier: number }) {
  return (
    <div className="flex items-center justify-between font-ui text-sm text-forest">
      <span>{label}</span>
      <span className="font-bold text-serpent-deep">
        ×{formatMultiplier(multiplier)}
      </span>
    </div>
  );
}

interface ShieldMeta {
  type: ShieldType;
  badge: string;
  name: string;
  blurb: string;
}

const SHIELD_META: Record<ShieldType, ShieldMeta> = {
  flawless: {
    type: "flawless",
    badge: "🛡️⚡",
    name: "Flawless Shield",
    blurb: "Protects your flawless streak from one mistake.",
  },
  daily: {
    type: "daily",
    badge: "🛡️🔥",
    name: "Daily Shield",
    blurb: "Protects your daily streak if you miss a day.",
  },
};

type ChestState = "closed" | "choose" | "claimed";

/**
 * First-completion reward. A closed chest the learner taps to open, then a
 * deliberate choice between two shields. Opening/reveal animations are
 * skipped under prefers-reduced-motion.
 */
function TreasureChest({
  onClaimShield,
}: {
  onClaimShield: (choice: ShieldType) => ChestClaimResult;
}) {
  const [state, setState] = useState<ChestState>("closed");
  const [claimed, setClaimed] = useState<{
    meta: ShieldMeta;
    result: ChestClaimResult;
  } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  }, []);

  const anim = (cls: string) => (reduceMotion ? "" : cls);

  const pick = (choice: ShieldType): void => {
    const result = onClaimShield(choice);
    setClaimed({ meta: SHIELD_META[choice], result });
    setState("claimed");
  };

  if (state === "closed") {
    return (
      <button
        type="button"
        onClick={() => setState("choose")}
        aria-label="Open the treasure chest"
        className="w-full rounded-blob border-2 border-wisdom bg-wisdom-soft p-5 text-center shadow-leaf transition-transform active:scale-95"
      >
        <span className={`block text-6xl ${anim("animate-wiggle")}`} aria-hidden="true">
          🎁
        </span>
        <span className="mt-2 block font-ui text-lg font-extrabold text-wisdom-deep">
          A treasure chest appeared!
        </span>
        <span className="mt-1 block font-ui text-sm font-semibold text-forest-soft">
          Tap to open
        </span>
      </button>
    );
  }

  if (state === "choose") {
    return (
      <div className="w-full rounded-blob border-2 border-wisdom bg-wisdom-soft p-5 text-center shadow-leaf">
        <span className={`block text-5xl ${anim("animate-pop-in")}`} aria-hidden="true">
          🎉
        </span>
        <h2 className="mt-2 font-ui text-lg font-extrabold text-wisdom-deep">
          Choose your shield
        </h2>
        <p className="mt-1 font-ui text-sm font-semibold text-forest-soft">
          Pick one to keep. Shields protect a streak from a single slip.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(["flawless", "daily"] as const).map((key) => {
            const meta = SHIELD_META[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                aria-label={`${meta.name}. ${meta.blurb}`}
                className="flex min-h-[132px] flex-col items-center justify-start gap-1.5 rounded-2xl border-2 border-sage-300 bg-cream-soft p-3 text-center transition-transform active:scale-95"
              >
                <span className="text-3xl" aria-hidden="true">
                  {meta.badge}
                </span>
                <span className="font-ui text-sm font-extrabold text-forest">
                  {meta.name}
                </span>
                <span className="font-ui text-xs font-semibold leading-snug text-forest-soft">
                  {meta.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // claimed
  const meta = claimed?.meta ?? SHIELD_META.flawless;
  const atMax = claimed?.result === "max";
  return (
    <div
      className={`w-full rounded-blob border-2 border-wisdom bg-wisdom-soft p-5 text-center shadow-leaf ${anim("animate-pop-in")}`}
      role="status"
      aria-live="polite"
    >
      <span className="block text-5xl" aria-hidden="true">
        {meta.badge}
      </span>
      <p className="mt-2 font-ui text-base font-extrabold text-wisdom-deep">
        {atMax
          ? `Already at max. Your ${meta.name} stash is full!`
          : `${meta.name} added to your inventory!`}
      </p>
    </div>
  );
}

export default function Celebration({
  lesson,
  nextLesson,
  summary,
  onClaimShield,
}: CelebrationProps) {
  // Confetti is a brief burst: skipped entirely under prefers-reduced-motion,
  // and the whole layer unmounts once every piece has faded out, so nothing
  // ever piles up or lingers on screen.
  const [confettiVisible, setConfettiVisible] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion) return;
    setConfettiVisible(true);
    const timer = window.setTimeout(
      () => setConfettiVisible(false),
      CONFETTI_LIFETIME_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  const heading =
    summary.flavor === "testout"
      ? "Tested out. Respect."
      : summary.flavor === "review"
        ? "Review complete. Still sharp!"
        : "You mastered";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-cream">
      {/* Confetti layer: a short burst, then fully removed. */}
      {confettiVisible && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          {CONFETTI_PIECES.map((piece, index) => (
            <span
              key={index}
              className="absolute top-0 block animate-confetti-fall opacity-0"
              style={{
                left: piece.left,
                width: `${piece.size}px`,
                height: `${piece.size * 1.4}px`,
                backgroundColor: piece.color,
                borderRadius: piece.rounded ? "9999px" : "2px",
                animationDelay: piece.delay,
                animationDuration: piece.duration,
              }}
            />
          ))}
        </div>
      )}

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div className="w-full animate-pop-in">
          <LessonImage
            src={lesson.image}
            glyph={lesson.glyph}
            alt={`The proud snake of the Tamil letter ${lesson.glyph}`}
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="font-ui text-2xl font-extrabold text-forest">
            {heading}
          </h1>
          <span className="font-tamil text-8xl font-bold leading-none text-forest">
            {lesson.glyph}
          </span>
          <p className="text-balance font-ui text-base leading-relaxed text-forest-soft">
            Your snake is coiled up with pride. The sound{" "}
            <span className="font-extrabold text-serpent-deep">
              {lesson.phonetic}
            </span>{" "}
            is yours now.
          </p>
        </div>

        {/* End-of-lesson XP summary */}
        <div className="w-full rounded-blob bg-cream-soft p-5 text-left shadow-leaf">
          <span className="font-ui text-lg font-extrabold text-forest">
            XP earned
          </span>
          <div className="mt-3 space-y-1.5 border-t border-sage-200 pt-3">
            <SummaryRow label="Base" value={summary.xp.base} />
            <SummaryRow label="Combo bonus" value={summary.xp.comboBonus} />
            <SummaryRow label="Time bonus" value={summary.xp.timeBonus} />
            {summary.flawlessMultiplier > 1 && (
              <MultiplierRow
                label="Flawless ⚡"
                multiplier={summary.flawlessMultiplier}
              />
            )}
            {summary.dailyMultiplier > 1 && (
              <MultiplierRow label="Daily 🔥" multiplier={summary.dailyMultiplier} />
            )}
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-sage-200 pt-3">
            <span className="font-ui text-lg font-extrabold text-forest">
              Total
            </span>
            <span className="font-ui text-2xl font-extrabold text-serpent-deep">
              +{summary.finalTotal}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-ui text-xs text-forest-soft">
              <span>Best combo</span>
              <span className="font-bold">x{summary.bestCombo.toFixed(1)}</span>
            </div>
            {summary.flawlessStreak >= 1 && (
              <div className="flex items-center justify-between font-ui text-xs text-forest-soft">
                <span>Flawless streak</span>
                <span className="font-bold">⚡ {summary.flawlessStreak}</span>
              </div>
            )}
            {summary.dailyStreak >= 1 && (
              <div className="flex items-center justify-between font-ui text-xs text-forest-soft">
                <span>Daily streak</span>
                <span className="font-bold">🔥 {summary.dailyStreak}</span>
              </div>
            )}
          </div>
          {summary.levelUp !== null && (
            <div className="mt-4 animate-pop-in rounded-2xl bg-wisdom-soft px-4 py-3 text-center">
              <span className="font-ui text-base font-extrabold text-wisdom-deep">
                {summary.levelUp.emoji} You&apos;ve grown into a{" "}
                {summary.levelUp.name}!
              </span>
            </div>
          )}
        </div>

        {/* First-completion treasure chest: choose one streak shield. */}
        {summary.offerChest && onClaimShield && (
          <TreasureChest onClaimShield={onClaimShield} />
        )}

        {nextLesson !== null ? (
          <div className="flex w-full flex-col items-center gap-4">
            <p className="font-ui text-lg font-bold text-forest">
              Next up:{" "}
              <span className="font-tamil text-2xl">{nextLesson.glyph}</span>{" "}
              ({nextLesson.phonetic})
            </p>
            <Link
              href={`/lesson/${nextLesson.id}`}
              className={PRIMARY_LINK_CLASSES}
            >
              Slither on to{" "}
              <span className="font-tamil text-xl">{nextLesson.glyph}</span>
            </Link>
            <Link
              href="/"
              className="flex min-h-[48px] items-center justify-center px-4 font-ui text-base font-bold text-forest underline underline-offset-4"
            >
              Back to the path
            </Link>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-4">
            <p className="text-balance font-ui text-lg font-bold text-forest">
              You&apos;ve traced every letter on the path so far. More coming
              soon!
            </p>
            <Link href="/" className={PRIMARY_LINK_CLASSES}>
              Back to the path
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
