"use client";

import { useState } from "react";
import { Button, LessonImage } from "@/components/ui";
import type { Lesson } from "@/lib/types";

/**
 * Learn task — the gentle introduction to a letter. Always passes: the
 * learner reads, meets the snake, and taps Continue.
 *
 * The illustration already shows the glyph and its sound, so when it loads we
 * drop the standalone glyph/phonetic block to save vertical space (they stay
 * available to screen readers). If the image is missing or 404s, we restore
 * the glyph and phonetic as visible text so the learner always knows the
 * letter.
 */

export interface TaskComponentProps {
  lesson: Lesson;
  onPass: () => void;
  onFail: () => void;
  isRedeeming: boolean;
}

export default function LearnTask({ lesson, onPass }: TaskComponentProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const paragraphs = lesson.peculiarities
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return (
    <div className="flex flex-1 flex-col gap-6 pt-2">
      {imageFailed ? (
        // Fallback: the illustration is unavailable, so the glyph and its
        // sound must appear as text.
        <div className="flex flex-col items-center gap-4">
          <span className="font-tamil text-8xl font-bold leading-none text-forest">
            {lesson.glyph}
          </span>
          <span className="inline-block -rotate-2 rounded-full bg-serpent px-6 py-2 font-ui text-2xl font-extrabold text-forest-deep shadow-node">
            {lesson.phonetic}
          </span>
        </div>
      ) : (
        <>
          <LessonImage
            src={lesson.image}
            glyph={lesson.glyph}
            alt={`A friendly snake shaped like the Tamil letter ${lesson.glyph}, which sounds like ${lesson.phonetic}`}
            onError={() => setImageFailed(true)}
          />
          {/* The image carries the glyph and its sound visually; keep them for
              screen readers without taking vertical space. */}
          <span className="sr-only">
            The letter {lesson.glyph}, pronounced {lesson.phonetic}
          </span>
        </>
      )}

      <div className="flex flex-col gap-4">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="font-ui text-base leading-relaxed text-forest"
          >
            {paragraph}
          </p>
        ))}
      </div>

      {lesson.vallalar_note !== null && (
        <div className="rounded-blob border-l-4 border-wisdom bg-wisdom-soft p-5">
          <h2 className="mb-2 flex items-center gap-2 font-ui text-sm font-extrabold uppercase tracking-wide text-wisdom-deep">
            <span aria-hidden="true">🪔</span>
            Vallalar&apos;s light
          </h2>
          <p className="font-ui text-base font-medium italic leading-relaxed text-forest">
            {lesson.vallalar_note}
          </p>
        </div>
      )}

      <div className="mt-auto pt-2">
        <Button variant="primary" fullWidth onClick={onPass}>
          Continue
        </Button>
      </div>
    </div>
  );
}
