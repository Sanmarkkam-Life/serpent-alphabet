import type { Metadata } from "next";
import IntroCard from "@/components/IntroCard";
import { getAllLessons } from "@/lib/lessons";

/**
 * "The Soul Letters": a single full-screen wisdom card shown before the
 * first lesson. Viewing it unlocks lesson 1 on the home path.
 */

export const metadata: Metadata = {
  title: "The Soul Letters · Serpent Alphabet",
};

export default function IntroPage() {
  const first = getAllLessons()[0] ?? null;
  return (
    <IntroCard
      firstLesson={first === null ? null : { id: first.id, glyph: first.glyph }}
    />
  );
}
