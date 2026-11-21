"use client";

import Link from "next/link";
import { useState } from "react";
import DonatePanel from "@/components/DonatePanel";
import { ORG_NAME, ORG_URL, type Placement } from "@/lib/giving";

/**
 * Quiet footer line: who offers TamiLearn, a link to learn more, and Donate.
 * Always present, never pops up.
 */
export default function OfferedBy({ placement }: { placement: Placement }) {
  const [open, setOpen] = useState(false);
  return (
    <footer className="mt-10 flex flex-col items-center gap-2 border-t border-cream-deep pt-5 text-center">
      <div className="flex items-center gap-2 font-ui text-sm font-bold text-forest-soft">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/sanmarkkam-life.png" alt="" width={28} height={28} />
        <span>
          Offered freely by{" "}
          <a
            href={ORG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-forest underline underline-offset-4"
          >
            {ORG_NAME}
          </a>
        </span>
      </div>
      <div className="flex items-center gap-4 font-ui text-sm font-bold">
        <Link href="/about-app" className="text-forest-soft underline underline-offset-4">
          About TamiLearn
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-serpent px-4 py-1.5 text-forest-deep shadow-node active:translate-y-0.5 active:shadow-none"
        >
          Donate
        </button>
      </div>
      <DonatePanel open={open} placement={placement} onClose={() => setOpen(false)} />
    </footer>
  );
}
