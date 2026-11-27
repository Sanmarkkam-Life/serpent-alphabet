import type { Metadata } from "next";
import { getAllLessons } from "@/lib/lessons";
import { getAllSigns } from "@/lib/signs";
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
  // Compound letters, sign by sign (one sitting of 18 per sign).
  for (const sign of getAllSigns()) {
    for (const c of sign.compounds) {
      letters.push({
        id: c.id,
        glyph: c.glyph,
        phonetic: c.translit,
        audio: c.audio ?? "",
        section: "sign",
      });
    }
  }

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
