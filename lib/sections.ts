/**
 * The path is grouped into sections. The lesson JSON stays schema-free of this
 * (same shape for every letter); section membership lives here, driving both
 * the consonant unlock gate and the labelled sections on the home path.
 */

/** The 12 vowels (uyir), in path order. */
export const VOWEL_IDS = [
  "a",
  "aa",
  "i",
  "ii",
  "u",
  "uu",
  "e",
  "ee",
  "ai",
  "o",
  "oo",
  "au",
] as const;

/** The 18 consonants (mei), in path order. */
export const CONSONANT_IDS = [
  "ka",
  "nga",
  "cha",
  "nya",
  "tta",
  "nna",
  "tha",
  "na",
  "pa",
  "ma",
  "ya",
  "ra",
  "la",
  "va",
  "zha",
  "lla",
  "rra",
  "nna2",
] as const;

export type Section = "vowel" | "consonant";

const CONSONANT_SET: ReadonlySet<string> = new Set(CONSONANT_IDS);
const VOWEL_SET: ReadonlySet<string> = new Set(VOWEL_IDS);

/** True for a consonant (mei) lesson id. */
export function isConsonantId(id: string): boolean {
  return CONSONANT_SET.has(id);
}

/** True for a vowel (uyir) lesson id. */
export function isVowelId(id: string): boolean {
  return VOWEL_SET.has(id);
}

/** Which section a lesson id belongs to, or null if unknown. */
export function sectionOf(id: string): Section | null {
  if (VOWEL_SET.has(id)) return "vowel";
  if (CONSONANT_SET.has(id)) return "consonant";
  return null;
}
