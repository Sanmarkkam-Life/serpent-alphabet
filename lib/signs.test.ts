import { describe, expect, it } from "vitest";
import { buildCompounds, COMPOUND_ID_RE, getAllSigns } from "./signs";

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

describe("getAllSigns", () => {
  const signs = getAllSigns();
  it("covers every sign, the pulli, Grantha and numbers", () => {
    const byId = Object.fromEntries(signs.map((s) => [s.id, s]));
    for (const id of ["pulli", "aa", "i", "ii", "u", "uu", "e", "ee", "ai", "o", "oo", "au"]) {
      expect(byId[id].compounds).toHaveLength(18);
    }
    expect(byId.grantha.compounds).toHaveLength(6);
    expect(byId.granthasigns.compounds).toHaveLength(60);
    expect(byId.granthasigns.compounds.map((c) => c.glyph)).toContain("ஜோ");
    expect(byId.numbers.compounds).toHaveLength(13);
  });
  it("gives every letter a unique, saveable id", () => {
    const ids = signs.flatMap((s) => s.compounds.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(COMPOUND_ID_RE.test(id)).toBe(true);
  });
});
