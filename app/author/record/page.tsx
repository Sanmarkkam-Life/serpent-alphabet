import type { Metadata } from "next";
import { getAllLessons } from "@/lib/lessons";
import { isConsonantId, isVowelId } from "@/lib/sections";
import RecordStudio, { type StudioLetter } from "@/components/RecordStudio";

/**
 * Hidden recording studio (/author/record): record the teacher's voice for
 * every letter on one page. Not linked from the learner UI.
 */

export const metadata: Metadata = {
  title: "Recording Studio · TamiLearn",
  robots: { index: false, follow: false },
};

export default function RecordPage() {
  const letters: StudioLetter[] = getAllLessons().map((l) => ({
    id: l.id,
    glyph: l.glyph,
    phonetic: l.phonetic,
    audio: l.audio,
    section: isVowelId(l.id) ? "vowel" : isConsonantId(l.id) ? "consonant" : "other",
  }));

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-5">
        <h1 className="font-ui text-2xl font-bold text-forest">Recording Studio</h1>
        <p className="mt-1 font-ui text-sm text-forest-soft">
          Your voice for every letter. Record, listen, save.
        </p>
      </header>
      <RecordStudio letters={letters} />
    </main>
  );
}
