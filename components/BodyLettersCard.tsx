"use client";

import Link from "next/link";
import { useEffect } from "react";
import { markBodyIntroViewed } from "@/lib/progress";

/**
 * "The Body Letters" intro card, shown after the twelve vowels and before the
 * first consonant. Opening it counts as viewing it (the first consonant
 * unlocks), so learners are never trapped if they leave without tapping the
 * button.
 */

export interface BodyLettersCardProps {
  firstConsonant: { id: string; glyph: string } | null;
}

/** A Tamil term with its transliteration and meaning, set apart visually. */
function Term({
  tamil,
  translit,
  meaning,
}: {
  tamil: string;
  translit: string;
  meaning: string;
}) {
  return (
    <span className="font-semibold text-forest">
      <span className="font-tamil font-bold">{tamil}</span> ({translit}):{" "}
      <strong>{meaning}</strong>
    </span>
  );
}

export default function BodyLettersCard({
  firstConsonant,
}: BodyLettersCardProps) {
  useEffect(() => {
    markBodyIntroViewed();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      <div className="animate-pop-in rounded-blob border-2 border-wisdom bg-wisdom-soft p-6 shadow-leaf">
        <p className="font-ui text-sm font-extrabold uppercase tracking-widest text-wisdom-deep">
          <span aria-hidden="true">🪷</span> Did you know?
        </p>
        <h1 className="mt-2 font-ui text-2xl font-extrabold text-forest">
          The Body Letters
        </h1>

        <div className="mt-5 space-y-4 font-ui text-base leading-relaxed text-forest">
          <p>
            You have met the twelve{" "}
            <Term tamil="உயிர்" translit="uyir" meaning="the soul letters" />.
            Now meet the eighteen{" "}
            <Term tamil="மெய்" translit="mei" meaning="the body" />.
          </p>
          <p>
            A consonant on its own is silent and still. Written with a dot above
            it, <span className="font-tamil font-bold">க்</span>, it is pure
            body, waiting. Give it a vowel and it comes alive:{" "}
            <span className="font-tamil font-bold">க் + அ = க</span> (ka).
          </p>
          <p>
            That is the whole system. Eighteen bodies, twelve souls, and the 216
            living letters they create together.
          </p>
          <p className="font-semibold">
            You learned the soul. Now you learn the body.
          </p>
        </div>

        {firstConsonant !== null && (
          <Link
            href={`/lesson/${firstConsonant.id}`}
            className="mt-7 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-bold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none"
          >
            Begin with{" "}
            <span className="font-tamil text-xl">{firstConsonant.glyph}</span>{" "}
            <span aria-hidden="true">→</span>
          </Link>
        )}

        <Link
          href="/"
          className="mt-3 flex min-h-[48px] items-center justify-center font-ui text-base font-bold text-forest underline underline-offset-4"
        >
          Back to the path
        </Link>
      </div>
    </main>
  );
}
