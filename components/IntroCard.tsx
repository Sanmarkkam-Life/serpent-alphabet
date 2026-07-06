"use client";

import Link from "next/link";
import { useEffect } from "react";
import { markIntroViewed } from "@/lib/progress";

/**
 * The Soul Letters intro card. Opening it counts as viewing it (the first
 * lesson unlocks), so learners are never trapped if they leave without
 * tapping the button.
 */

export interface IntroCardProps {
  firstLesson: { id: string; glyph: string } | null;
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

export default function IntroCard({ firstLesson }: IntroCardProps) {
  useEffect(() => {
    markIntroViewed();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      <div className="animate-pop-in rounded-blob border-2 border-wisdom bg-wisdom-soft p-6 shadow-leaf">
        <p className="font-ui text-sm font-extrabold uppercase tracking-widest text-wisdom-deep">
          <span aria-hidden="true">🪔</span> Did you know?
        </p>

        <div className="mt-5 space-y-5 font-ui text-lg leading-relaxed text-forest">
          <p>
            In Tamil, vowels are called{" "}
            <Term
              tamil="உயிர் எழுத்துக்கள்"
              translit="uyir ezhuthukkal"
              meaning="soul letters"
            />
            .
          </p>
          <p>
            Consonants are{" "}
            <Term
              tamil="மெய் எழுத்துக்கள்"
              translit="mei ezhuthukkal"
              meaning="body letters"
            />
            .
          </p>
          <p>
            A body without a soul cannot move. A consonant without a vowel
            cannot speak. The true magic of Tamil happens when soul and body
            combine to form{" "}
            <Term
              tamil="உயிர்மெய் எழுத்துக்கள்"
              translit="uyirmei ezhuthukkal"
              meaning="the living compound letters"
            />
            .
          </p>
          <p className="font-semibold">
            You begin where Tamil begins: with the soul. Twelve vowels, one at
            a time.
          </p>
        </div>

        {firstLesson !== null && (
          <Link
            href={`/lesson/${firstLesson.id}`}
            className="mt-7 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-bold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none"
          >
            Begin with{" "}
            <span className="font-tamil text-xl">{firstLesson.glyph}</span>{" "}
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
