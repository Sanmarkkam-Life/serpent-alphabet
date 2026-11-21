/**
 * Giving: how TamiLearn invites donations to Sanmarkkam Life.
 *
 * The app holds no payment code. Donations go through the organisation's
 * existing Donorbox form (card, Apple Pay, Google Pay, PayPal, monthly or
 * once, email receipt), opened inside the app with the amount pre-filled.
 *
 * Asks are gentle: never before or during a lesson, each shown at most once,
 * always skippable. This file is pure logic so it can be unit-tested.
 */

import { CONSONANT_IDS, VOWEL_IDS } from "./sections";

export const ORG_NAME = "Sanmarkkam Life";
export const ORG_URL = "https://sanmarkkamlife.org/";
export const DONATE_PAGE_URL = "https://sanmarkkamlife.org/donate/";
/** The Donorbox campaign the website's donate page uses. */
export const DONORBOX_CAMPAIGN = "sanmarkkam-en-monthly";

export type Interval = "monthly" | "once";

/** Where the learner opened the donate panel; tagged for Donorbox reports. */
export type Placement =
  | "home-footer"
  | "about-app"
  | "vowels-complete"
  | "consonants-complete";

export interface AmountOption {
  amount: number;
  label: string;
  /** Impact line, taken from the website's own donate page. */
  impact: string;
}

/** €1 is left out on purpose: fees take over a quarter of a €1 gift. */
export const AMOUNT_OPTIONS: readonly AmountOption[] = [
  {
    amount: 5,
    label: "Feed a Soul",
    impact:
      "Places an Emporium product, herbs or wholesome food, in hands that need it.",
  },
  {
    amount: 20,
    label: "Keep the Light",
    impact: "Keeps our free publications, satsangs and food service alive.",
  },
  {
    amount: 50,
    label: "Open a Path",
    impact: "Helps open new centres and carry the mission to new countries.",
  },
];

export const DEFAULT_AMOUNT = 20;
export const DEFAULT_INTERVAL: Interval = "monthly";
export const MIN_CUSTOM_AMOUNT = 1;
export const MAX_CUSTOM_AMOUNT = 10000;

/**
 * Turns free text into a whole-euro amount, or null when it is not a usable
 * number in range. Accepts "25", "25.00", "25,5" (rounded), " €30 ".
 */
export function parseCustomAmount(raw: string): number | null {
  const cleaned = raw.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Math.round(Number(cleaned));
  if (!Number.isFinite(value)) return null;
  if (value < MIN_CUSTOM_AMOUNT || value > MAX_CUSTOM_AMOUNT) return null;
  return value;
}

/**
 * The Donorbox form URL, pre-filled with amount and interval.
 * `embed` gives the in-app (iframe) version; otherwise the full page.
 * Donorbox reads `amount` and `default_interval` (m = monthly, o = once).
 */
export function donorboxUrl(options: {
  amount: number;
  interval: Interval;
  placement: Placement;
  embed: boolean;
}): string {
  const base = options.embed
    ? `https://donorbox.org/embed/${DONORBOX_CAMPAIGN}`
    : `https://donorbox.org/${DONORBOX_CAMPAIGN}`;
  const params = new URLSearchParams({
    amount: String(options.amount),
    default_interval: options.interval === "monthly" ? "m" : "o",
    utm_source: "tamilearn",
    utm_medium: "app",
    utm_campaign: options.placement,
  });
  return `${base}?${params.toString()}`;
}

/** The card shown on the lesson-complete screen. */
export type GivingCard = "welcome" | "vowels-complete" | "consonants-complete";

/** Which cards the learner has already seen (each appears once). */
export interface GivingSeen {
  welcome: boolean;
  "vowels-complete": boolean;
  "consonants-complete": boolean;
}

export const NO_CARDS_SEEN: GivingSeen = {
  welcome: false,
  "vowels-complete": false,
  "consonants-complete": false,
};

function allDone(ids: readonly string[], done: ReadonlySet<string>): boolean {
  return ids.every((id) => done.has(id));
}

/**
 * Decides which giving card (if any) belongs on this lesson-complete screen.
 * - Reviews never show a card.
 * - Finishing a whole group (the lesson completes its section) shows that
 *   group's donation ask, once.
 * - Otherwise the very first time a lesson is completed shows a thank-you
 *   with no money ask, once.
 */
export function chooseGivingCard(input: {
  lessonId: string;
  flavor: "normal" | "review" | "testout";
  completedIds: readonly string[];
  seen: GivingSeen;
}): GivingCard | null {
  if (input.flavor === "review") return null;
  const done = new Set(input.completedIds);
  const id = input.lessonId;

  if (
    (VOWEL_IDS as readonly string[]).includes(id) &&
    allDone(VOWEL_IDS, done) &&
    !input.seen["vowels-complete"]
  ) {
    return "vowels-complete";
  }
  if (
    (CONSONANT_IDS as readonly string[]).includes(id) &&
    allDone(CONSONANT_IDS, done) &&
    !input.seen["consonants-complete"]
  ) {
    return "consonants-complete";
  }
  if (!input.seen.welcome) return "welcome";
  return null;
}

const SEEN_KEY = "tamilearn_giving_seen";

/** Reads which cards were seen; any storage problem means "none seen". */
export function loadGivingSeen(): GivingSeen {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return { ...NO_CARDS_SEEN };
    const parsed = JSON.parse(raw) as Partial<GivingSeen>;
    return {
      welcome: parsed.welcome === true,
      "vowels-complete": parsed["vowels-complete"] === true,
      "consonants-complete": parsed["consonants-complete"] === true,
    };
  } catch {
    return { ...NO_CARDS_SEEN };
  }
}

export function markGivingSeen(card: GivingCard): void {
  try {
    const next = { ...loadGivingSeen(), [card]: true };
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the card may show again, which is harmless.
  }
}
