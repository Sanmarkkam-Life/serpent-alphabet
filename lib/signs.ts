import fs from "node:fs";
import path from "node:path";
import { CONSONANT_IDS } from "./sections";

/**
 * Vowel signs (uyirmei). One JSON per sign in /content/signs. The 18
 * compound letters of a sign are generated here, never typed by hand.
 * Server-only (node:fs).
 */

export interface SignWord {
  word: string;
  translit: string;
  meaning: string;
}

export interface Compound {
  /** e.g. "ka_aa" (also the audio file name). */
  id: string;
  consonantId: string;
  consonant: string;
  glyph: string;
  translit: string;
  audio: string | null;
}

export interface Sign {
  id: string;
  order: number;
  sign: string;
  vowelId: string;
  vowelGlyph: string | null;
  /** "set": a list of letters (Grantha), not a sign joined to consonants. */
  kind: "sign" | "set";
  sound: string;
  name: string;
  costume: string;
  /** The sign changes the letter's shape (u, uu): show all 18 first. */
  irregular: boolean;
  image: string | null;
  words: SignWord[];
  compounds: Compound[];
}

/** Consonant glyph and its sound without the inherent "a". */
export const CONSONANT_ROOTS: Record<string, { glyph: string; root: string }> = {
  ka: { glyph: "க", root: "k" },
  nga: { glyph: "ங", root: "ng" },
  cha: { glyph: "ச", root: "ch" },
  nya: { glyph: "ஞ", root: "ny" },
  tta: { glyph: "ட", root: "ṭ" },
  nna: { glyph: "ண", root: "ṇ" },
  tha: { glyph: "த", root: "th" },
  na: { glyph: "ந", root: "n" },
  pa: { glyph: "ப", root: "p" },
  ma: { glyph: "ம", root: "m" },
  ya: { glyph: "ய", root: "y" },
  ra: { glyph: "ர", root: "r" },
  la: { glyph: "ல", root: "l" },
  va: { glyph: "வ", root: "v" },
  zha: { glyph: "ழ", root: "zh" },
  lla: { glyph: "ள", root: "ḷ" },
  rra: { glyph: "ற", root: "ṟ" },
  nna2: { glyph: "ன", root: "ṉ" },
};

export const COMPOUND_ID_RE = /^([a-z][a-z0-9]*)_([a-z]+)$/;

export function compoundId(consonantId: string, signId: string): string {
  return `${consonantId}_${signId}`;
}

/** Build the 18 compounds for a sign mark (pure; tested). */
export function buildCompounds(
  signId: string,
  mark: string,
  sound: string,
  audio: Record<string, string>,
): Compound[] {
  return CONSONANT_IDS.map((cid) => {
    const { glyph, root } = CONSONANT_ROOTS[cid];
    const id = compoundId(cid, signId);
    return {
      id,
      consonantId: cid,
      consonant: glyph,
      glyph: glyph + mark,
      translit: root + sound,
      audio: audio[id] ?? null,
    };
  });
}

const SIGNS_DIR = path.join(process.cwd(), "content", "signs");

export function getAllSigns(): Sign[] {
  if (!fs.existsSync(SIGNS_DIR)) return [];
  const signs: Sign[] = fs
    .readdirSync(SIGNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const raw = JSON.parse(fs.readFileSync(path.join(SIGNS_DIR, f), "utf8"));
      const audio = (raw.audio ?? {}) as Record<string, string>;
      return {
        id: raw.id,
        order: raw.order,
        sign: raw.sign,
        vowelId: raw.vowel_id ?? "",
        vowelGlyph: raw.vowel_glyph ?? null,
        sound: raw.sound,
        name: raw.name,
        costume: raw.costume,
        irregular: raw.irregular === true,
        image: raw.image ?? null,
        words: raw.words ?? [],
        kind: Array.isArray(raw.letters) || raw.generate ? "set" : "sign",
        generate: raw.generate ?? null,
        compounds: raw.generate
          ? []
          : Array.isArray(raw.letters)
          ? (raw.letters as { id: string; glyph: string; translit: string }[]).map((l) => {
              const id = compoundId(l.id, raw.id);
              return { id, consonantId: l.id, consonant: l.glyph, glyph: l.glyph, translit: l.translit, audio: audio[id] ?? null };
            })
          : buildCompounds(raw.id, raw.sign, raw.sound, audio),
      } as Sign;
    })
    .sort((a, b) => a.order - b.order);
  // "Grantha with signs": every Grantha letter wearing every sign.
  for (const set of signs) {
    if ((set as Sign & { generate?: string | null }).generate !== "grantha") continue;
    const audio = set.compounds.reduce<Record<string, string>>((m, c) => (c.audio ? { ...m, [c.id]: c.audio } : m), {});
    const raw = JSON.parse(fs.readFileSync(path.join(SIGNS_DIR, `${set.id}.json`), "utf8"));
    const saved = (raw.audio ?? {}) as Record<string, string>;
    set.compounds = signs
      .filter((s) => s.kind === "sign")
      .flatMap((s) =>
        GRANTHA_ROOTS.map((g) => {
          const id = compoundId(`${g.id}${s.order}`, set.id);
          return { id, consonantId: g.id, consonant: g.glyph, glyph: g.glyph + s.sign, translit: g.root + s.sound, audio: saved[id] ?? audio[id] ?? null };
        }),
      );
  }
  return signs;
}

/** Grantha letters that join with vowel signs (ஸ்ரீ is a fixed form). */
export const GRANTHA_ROOTS = [
  { id: "ja", glyph: "ஜ", root: "j" },
  { id: "sha", glyph: "ஷ", root: "sh" },
  { id: "sa", glyph: "ஸ", root: "s" },
  { id: "ha", glyph: "ஹ", root: "h" },
  { id: "ksha", glyph: "க்ஷ", root: "ksh" },
];

export function getSignById(id: string): Sign | null {
  return getAllSigns().find((s) => s.id === id) ?? null;
}

/** Progress id for a finished sign lesson. */
export function signLessonId(signId: string): string {
  return `sign-${signId}`;
}
