import { describe, expect, it } from "vitest";
import { buildCompounds, COMPOUND_ID_RE } from "./signs";

describe("buildCompounds", () => {
  const list = buildCompounds("aa", "ா", "aa", { ka_aa: "/audio/signs/ka_aa.wav" });
  it("makes 18 letters", () => expect(list).toHaveLength(18));
  it("joins consonant and sign", () => {
    expect(list[0]).toMatchObject({ id: "ka_aa", glyph: "கா", translit: "kaa", audio: "/audio/signs/ka_aa.wav" });
    expect(list[17].glyph).toBe("னா");
    expect(list[1].audio).toBeNull();
  });
  it("ids match the save-audio pattern", () => {
    for (const c of list) expect(COMPOUND_ID_RE.test(c.id)).toBe(true);
  });
});
