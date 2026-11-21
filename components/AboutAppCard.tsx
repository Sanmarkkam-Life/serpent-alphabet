"use client";

import Link from "next/link";
import { useState } from "react";
import DonatePanel from "@/components/DonatePanel";
import { ORG_NAME, ORG_URL } from "@/lib/giving";

/**
 * About TamiLearn: who offers the app, why, and the permanent place to give.
 */
export default function AboutAppCard() {
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-5 py-8">
      <div className="animate-pop-in rounded-blob bg-cream-soft p-6 shadow-leaf">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sanmarkkam-life.png" alt="" width={48} height={48} />
          <div>
            <p className="font-ui text-xs font-extrabold uppercase tracking-widest text-wisdom-deep">
              Offered by
            </p>
            <h1 className="font-ui text-2xl font-extrabold text-forest">{ORG_NAME}</h1>
          </div>
        </div>
        <div className="mt-4 space-y-3 font-ui text-base leading-relaxed text-forest">
          <p>
            TamiLearn is made by {ORG_NAME}, a registered European nonprofit
            that shares the teachings of Vallalar (Ramalinga Adigal,
            1823–1874): compassion for every living being.
          </p>
          <p>
            Vallalar wrote in Tamil. Learning its letters opens the door to his
            words in their own language. The Serpent Alphabet gives every letter
            a friendly snake, so the shapes stay with you.
          </p>
          <p className="font-semibold">TamiLearn is free for everyone, and it always will be.</p>
        </div>
        <a
          href={ORG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block font-ui text-sm font-bold text-forest underline underline-offset-4"
        >
          Visit sanmarkkamlife.org →
        </a>
      </div>

      <div className="rounded-blob border-l-4 border-wisdom bg-wisdom-soft p-6 shadow-leaf">
        <h2 className="font-ui text-lg font-extrabold text-wisdom-deep">Keep TamiLearn free</h2>
        <p className="mt-2 font-ui text-base leading-relaxed text-forest">
          If TamiLearn helped you, a gift of any size keeps it free for the next
          learner and supports free food, publications and centres. A monthly
          gift helps us most; a one-time gift is just as welcome.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-extrabold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none"
        >
          Donate
        </button>
        <p className="mt-2 text-center font-ui text-xs text-forest-soft">
          100% of every gift serves the mission.
        </p>
      </div>

      <Link
        href="/"
        className="flex min-h-[48px] items-center justify-center font-ui text-base font-bold text-forest underline underline-offset-4"
      >
        Back to the path
      </Link>

      <DonatePanel open={open} placement="about-app" onClose={() => setOpen(false)} />
    </main>
  );
}
