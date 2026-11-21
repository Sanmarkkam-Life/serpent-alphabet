"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import DonatePanel from "@/components/DonatePanel";
import {
  chooseGivingCard,
  loadGivingSeen,
  markGivingSeen,
  type GivingCard as Card,
} from "@/lib/giving";
import { loadProgress } from "@/lib/progress";

/**
 * The once-only giving note on the lesson-complete screen.
 * - First lesson ever: a welcome that names who offers the app. No ask.
 * - All vowels / all consonants done: the donation ask, with Maybe later.
 * Decided once on mount and marked seen at once, so it never repeats.
 */

const COPY: Record<Card, { title: string; body: string }> = {
  welcome: {
    title: "A gift to you",
    body: "TamiLearn is free for everyone, offered in compassion by Sanmarkkam Life. Keep learning: it stays free.",
  },
  "vowels-complete": {
    title: "All twelve soul letters!",
    body: "You have learned the twelve soul letters. If TamiLearn helped you, you can help keep it free for the next learner.",
  },
  "consonants-complete": {
    title: "All eighteen body letters!",
    body: "Soul and body: you now know every Tamil letter. If TamiLearn helped you, you can help keep it free for the next learner.",
  },
};

export default function GivingCard({
  lessonId,
  flavor,
}: {
  lessonId: string;
  flavor: "normal" | "review" | "testout";
}) {
  const [card, setCard] = useState<Card | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  // Decide exactly once per mount (dev Strict Mode runs effects twice, and
  // the second run would see the card already marked as seen).
  const decidedRef = useRef(false);

  useEffect(() => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    const chosen = chooseGivingCard({
      lessonId,
      flavor,
      completedIds: loadProgress().completed,
      seen: loadGivingSeen(),
    });
    if (chosen) markGivingSeen(chosen);
    setCard(chosen);
  }, [lessonId, flavor]);

  if (card === null || dismissed) return null;
  const isAsk = card !== "welcome";
  const { title, body } = COPY[card];

  return (
    <div className="w-full animate-pop-in rounded-blob border-l-4 border-wisdom bg-wisdom-soft p-5 text-left shadow-leaf">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/sanmarkkam-life.png" alt="" width={30} height={30} />
        <span className="font-ui text-base font-extrabold text-wisdom-deep">{title}</span>
      </div>
      <p className="mt-2 font-ui text-sm leading-relaxed text-forest">{body}</p>
      {isAsk ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full bg-serpent px-5 py-2 font-ui text-sm font-extrabold text-forest-deep shadow-node active:translate-y-0.5 active:shadow-none"
          >
            Donate
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="font-ui text-sm font-bold text-forest-soft underline underline-offset-4"
          >
            Maybe later
          </button>
          <DonatePanel
            open={open}
            placement={card === "vowels-complete" ? "vowels-complete" : "consonants-complete"}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : (
        <Link
          href="/about-app"
          className="mt-2 inline-block font-ui text-sm font-bold text-forest underline underline-offset-4"
        >
          Who we are →
        </Link>
      )}
    </div>
  );
}
