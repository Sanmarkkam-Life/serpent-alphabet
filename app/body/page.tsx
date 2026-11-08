import type { Metadata } from "next";
import BodyLettersCard from "@/components/BodyLettersCard";
import { getLessonById } from "@/lib/lessons";
import { CONSONANT_IDS } from "@/lib/sections";

/**
 * "The Body Letters": a single full-screen wisdom card shown after the twelve
 * vowels and before the first consonant. Viewing it unlocks the first
 * consonant on the home path.
 */

export const metadata: Metadata = {
  title: "The Body Letters · Serpent Alphabet",
};

export default function BodyPage() {
  const first = getLessonById(CONSONANT_IDS[0]);
  return (
    <BodyLettersCard
      firstConsonant={
        first === null ? null : { id: first.id, glyph: first.glyph }
      }
    />
  );
}
