import { describe, expect, it } from "vitest";
import {
  chooseGivingCard,
  donorboxUrl,
  NO_CARDS_SEEN,
  parseCustomAmount,
} from "./giving";
import { CONSONANT_IDS, VOWEL_IDS } from "./sections";

describe("donorboxUrl", () => {
  it("pre-fills amount, monthly interval and tracking for the in-app form", () => {
    const url = new URL(
      donorboxUrl({
        amount: 20,
        interval: "monthly",
        placement: "vowels-complete",
        embed: true,
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://donorbox.org/embed/sanmarkkam-en-monthly",
    );
    expect(url.searchParams.get("amount")).toBe("20");
    expect(url.searchParams.get("default_interval")).toBe("m");
    expect(url.searchParams.get("utm_source")).toBe("tamilearn");
    expect(url.searchParams.get("utm_campaign")).toBe("vowels-complete");
  });

  it("uses the full page and one-time interval when asked", () => {
    const url = new URL(
      donorboxUrl({ amount: 5, interval: "once", placement: "about-app", embed: false }),
    );
    expect(url.pathname).toBe("/sanmarkkam-en-monthly");
    expect(url.searchParams.get("default_interval")).toBe("o");
  });
});

describe("parseCustomAmount", () => {
  it("accepts plain and decorated numbers", () => {
    expect(parseCustomAmount("25")).toBe(25);
    expect(parseCustomAmount(" €30 ")).toBe(30);
    expect(parseCustomAmount("12,6")).toBe(13);
  });
  it("rejects empty, words, zero and huge amounts", () => {
    expect(parseCustomAmount("")).toBeNull();
    expect(parseCustomAmount("ten")).toBeNull();
    expect(parseCustomAmount("0")).toBeNull();
    expect(parseCustomAmount("-5")).toBeNull();
    expect(parseCustomAmount("100000")).toBeNull();
  });
});

describe("chooseGivingCard", () => {
  it("shows the thank-you (no ask) after the first lesson", () => {
    expect(
      chooseGivingCard({
        lessonId: "a",
        flavor: "normal",
        completedIds: ["a"],
        seen: NO_CARDS_SEEN,
      }),
    ).toBe("welcome");
  });

  it("shows nothing on later lessons once the thank-you was seen", () => {
    expect(
      chooseGivingCard({
        lessonId: "i",
        flavor: "normal",
        completedIds: ["a", "aa", "i"],
        seen: { ...NO_CARDS_SEEN, welcome: true },
      }),
    ).toBeNull();
  });

  it("asks once when the last vowel completes the group", () => {
    const input = {
      lessonId: "au",
      flavor: "normal" as const,
      completedIds: [...VOWEL_IDS],
      seen: { ...NO_CARDS_SEEN, welcome: true },
    };
    expect(chooseGivingCard(input)).toBe("vowels-complete");
    expect(
      chooseGivingCard({
        ...input,
        seen: { ...input.seen, "vowels-complete": true },
      }),
    ).toBeNull();
  });

  it("asks when the consonants are all done", () => {
    expect(
      chooseGivingCard({
        lessonId: "nna2",
        flavor: "testout",
        completedIds: [...VOWEL_IDS, ...CONSONANT_IDS],
        seen: { welcome: true, "vowels-complete": true, "consonants-complete": false },
      }),
    ).toBe("consonants-complete");
  });

  it("never shows a card after a review", () => {
    expect(
      chooseGivingCard({
        lessonId: "au",
        flavor: "review",
        completedIds: [...VOWEL_IDS],
        seen: NO_CARDS_SEEN,
      }),
    ).toBeNull();
  });
});
