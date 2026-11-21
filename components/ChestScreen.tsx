"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChestClaimResult, ShieldType } from "@/lib/progress";

/**
 * A dedicated reward screen, shown after the summary only when a chest was
 * earned. A closed chest to tap open, then a deliberate choice between two
 * shields, then a door home. Opening/reveal animations are skipped under
 * prefers-reduced-motion.
 */

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

const HOME_LINK_CLASSES =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-bold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none";

type ChestState = "closed" | "choose" | "claimed";

export interface ChestScreenProps {
  /** Claim the chest with the chosen shield; returns what the pick yielded. */
  onClaimShield: (choice: ShieldType) => ChestClaimResult;
}

export default function ChestScreen({ onClaimShield }: ChestScreenProps) {
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      {state === "closed" && (
        <>
          <h1 className="font-ui text-2xl font-extrabold text-wisdom-deep">
            A treasure chest appeared!
          </h1>
          <button
            type="button"
            onClick={() => setState("choose")}
            aria-label="Open the treasure chest"
            className="flex w-full flex-col items-center gap-3 rounded-blob border-2 border-wisdom bg-wisdom-soft p-8 shadow-leaf transition-transform active:scale-95"
          >
            <span
              className={`block text-8xl ${anim("animate-wiggle")}`}
              aria-hidden="true"
            >
              🎁
            </span>
            <span className="font-ui text-base font-semibold text-forest-soft">
              Tap to open
            </span>
          </button>
        </>
      )}

      {state === "choose" && (
        <>
          <span
            className={`block text-6xl ${anim("animate-pop-in")}`}
            aria-hidden="true"
          >
            🎉
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-ui text-2xl font-extrabold text-wisdom-deep">
              Choose your shield
            </h1>
            <p className="font-ui text-sm font-semibold text-forest-soft">
              Pick one to keep. Shields protect a streak from a single slip.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3">
            {(["flawless", "daily"] as const).map((key) => {
              const meta = SHIELD_META[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(key)}
                  aria-label={`${meta.name}. ${meta.blurb}`}
                  className="flex min-h-[150px] flex-col items-center justify-start gap-2 rounded-2xl border-2 border-sage-300 bg-cream-soft p-4 text-center transition-transform active:scale-95"
                >
                  <span className="text-4xl" aria-hidden="true">
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
        </>
      )}

      {state === "claimed" && claimed !== null && (
        <>
          <span
            className={`block text-7xl ${anim("animate-pop-in")}`}
            aria-hidden="true"
          >
            {claimed.meta.badge}
          </span>
          <p
            className="font-ui text-lg font-extrabold text-wisdom-deep"
            role="status"
            aria-live="polite"
          >
            {claimed.result === "max"
              ? `Already at max. Your ${claimed.meta.name} stash is full!`
              : `${claimed.meta.name} added to your inventory!`}
          </p>
          <Link href="/" className={HOME_LINK_CLASSES}>
            Back to the path
          </Link>
        </>
      )}
    </main>
  );
}
