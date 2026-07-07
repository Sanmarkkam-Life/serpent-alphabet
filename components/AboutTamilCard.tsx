"use client";

import Link from "next/link";
import { useEffect } from "react";
import { markTamilIntroViewed } from "@/lib/progress";

/**
 * "The Living Language" — an educational card about Tamil itself, shown
 * before the Soul Letters intro. Opening it counts as viewing it (the Soul
 * Letters intro unlocks), so learners are never trapped if they leave
 * without tapping the button.
 */

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

export default function AboutTamilCard() {
  useEffect(() => {
    markTamilIntroViewed();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-8">
      <div className="animate-pop-in rounded-blob border-2 border-wisdom bg-wisdom-soft p-6 shadow-leaf">
        <p className="font-ui text-sm font-extrabold uppercase tracking-widest text-wisdom-deep">
          <span aria-hidden="true">📖</span> About Tamil
        </p>
        <h1 className="mt-2 font-ui text-2xl font-extrabold text-forest">
          The Living Language
        </h1>

        <div className="mt-5 space-y-4 font-ui text-base leading-relaxed text-forest">
          <p>
            Tamil is one of the oldest living languages on Earth. Its written
            tradition stretches back over two thousand years, yet it thrives
            today as the daily speech of over 80 million people.
          </p>
          <p>
            Ramalinga Swamigal, the great sage whose light guides this path,
            honored Tamil as the language closest to the soul&apos;s own
            expression. He wrote all 5,818 verses of Thiru Arutpa in Tamil,
            choosing it as the vessel for the highest truths he knew.
          </p>
          <p>
            Tamil is a classical language, one of only six in the world to hold
            that distinction. Its grammar was formalized in the Tolkappiyam
            over two millennia ago, and that same grammatical tradition is
            still taught and used today.
          </p>
          <p>
            The Tamil script you are about to learn has 247 characters, but do
            not worry. They are built from a simple, elegant system:
          </p>
          <div className="rounded-2xl bg-cream-soft p-4">
            <ul className="space-y-1.5 font-semibold text-forest">
              <li>
                12 vowels,{" "}
                <Term tamil="உயிர்" translit="uyir" meaning="the soul" />
              </li>
              <li>
                18 consonants,{" "}
                <Term tamil="மெய்" translit="mei" meaning="the body" />
              </li>
              <li>
                216 compound letters,{" "}
                <Term
                  tamil="உயிர்மெய்"
                  translit="uyirmei"
                  meaning="the living"
                />
              </li>
              <li>
                1 special character (
                <span className="font-tamil font-bold">ஃ</span>, aytham)
              </li>
            </ul>
          </div>
          <p>
            Soul combines with body to create life. That is the logic of Tamil,
            and it is the logic of this path.
          </p>
          <p className="font-semibold">You begin with the soul.</p>
        </div>

        <Link
          href="/intro"
          className="mt-7 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-bold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none"
        >
          Continue <span aria-hidden="true">→</span>
        </Link>

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
