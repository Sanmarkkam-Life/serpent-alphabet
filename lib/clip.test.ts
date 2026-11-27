import { describe, expect, it } from "vitest";
import {
  cleanClip,
  encodeWav,
  looksLikeWav,
  resample,
  TARGET_PEAK_DB,
  toMono,
} from "./clip";

const RATE = 24000;

/** silence, then a 0.3 s tone at the given amplitude, then silence */
function take(amplitude: number): Float32Array {
  const s = new Float32Array(RATE * 2);
  const start = Math.round(RATE * 0.8);
  const end = start + Math.round(RATE * 0.3);
  for (let i = start; i < end; i++) s[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE);
  for (let i = 0; i < s.length; i++) s[i] += (i % 7 === 0 ? 1 : -1) * 0.0003; // faint room noise
  return s;
}

describe("cleanClip", () => {
  it("trims the silence around the sound, keeping a little padding", () => {
    const out = cleanClip(take(0.2), RATE);
    expect(out.silent).toBe(false);
    expect(out.durationS).toBeGreaterThan(0.3);
    expect(out.durationS).toBeLessThan(0.6);
  });

  it("levels quiet and loud takes to the same peak", () => {
    const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const target = Math.pow(10, TARGET_PEAK_DB / 20);
    expect(peak(cleanClip(take(0.02), RATE).samples)).toBeCloseTo(target, 1);
    expect(peak(cleanClip(take(0.9), RATE).samples)).toBeCloseTo(target, 1);
  });

  it("reports a take with no voice as silent", () => {
    const out = cleanClip(new Float32Array(RATE).fill(0.0001), RATE);
    expect(out.silent).toBe(true);
  });
});

describe("encodeWav", () => {
  it("writes a valid mono 16-bit WAV header and data size", () => {
    const bytes = encodeWav(new Float32Array(100), RATE);
    expect(looksLikeWav(bytes)).toBe(true);
    expect(bytes.length).toBe(44 + 200);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint16(22, true)).toBe(1);
  });

  it("rejects bytes that are not a WAV", () => {
    expect(looksLikeWav(new Uint8Array(60))).toBe(false);
  });
});

describe("toMono and resample", () => {
  it("averages channels and halves length when halving the rate", () => {
    const mono = toMono([new Float32Array([1, 1]), new Float32Array([0, 0])]);
    expect(Array.from(mono)).toEqual([0.5, 0.5]);
    expect(resample(new Float32Array(48000), 48000, 24000).length).toBe(24000);
  });
});
