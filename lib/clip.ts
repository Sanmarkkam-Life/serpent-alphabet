/**
 * Turns a raw recording into a clean teaching clip: mono, trimmed of the
 * silence before and after the sound, levelled to a steady peak, with short
 * fades, encoded as a 16-bit WAV that every browser can play.
 *
 * Pure functions on Float32Array samples, so they can be unit-tested without
 * a browser. The browser part (decoding the recording) lives in the studio.
 */

/** Target sample rate: plenty for speech, small files (~48 KB per second). */
export const CLIP_SAMPLE_RATE = 24000;
/** Peak level after levelling, in dBFS. */
export const TARGET_PEAK_DB = -1.5;
/** Anything quieter than this (relative to the loudest moment) is "silence". */
export const SILENCE_RELATIVE_DB = -36;
/** Breathing room kept before and after the sound. */
export const PAD_BEFORE_S = 0.08;
export const PAD_AFTER_S = 0.15;

export interface ClipResult {
  samples: Float32Array;
  sampleRate: number;
  durationS: number;
  /** True when nothing louder than background noise was found. */
  silent: boolean;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Average several channels into one. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const length = channels[0].length;
  const out = new Float32Array(length);
  for (const ch of channels) {
    for (let i = 0; i < length; i++) out[i] += ch[i] / channels.length;
  }
  return out;
}

/** Linear-interpolation resample (fine for speech at these rates). */
export function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/**
 * Trim, level and fade. Silence is judged in 10 ms windows against the
 * loudest window, so it adapts to quiet and loud recordings alike.
 */
export function cleanClip(input: Float32Array, sampleRate: number): ClipResult {
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const windows = Math.ceil(input.length / win);
  const rms = new Float32Array(windows);
  let loudest = 0;
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    const start = w * win;
    const end = Math.min(start + win, input.length);
    for (let i = start; i < end; i++) sum += input[i] * input[i];
    rms[w] = Math.sqrt(sum / Math.max(1, end - start));
    if (rms[w] > loudest) loudest = rms[w];
  }
  // Below about -55 dBFS the whole take is just room noise.
  if (loudest < dbToGain(-55)) {
    return { samples: new Float32Array(0), sampleRate, durationS: 0, silent: true };
  }
  const threshold = loudest * dbToGain(SILENCE_RELATIVE_DB);
  let first = 0;
  while (first < windows && rms[first] < threshold) first++;
  let last = windows - 1;
  while (last > first && rms[last] < threshold) last--;

  const start = Math.max(0, first * win - Math.round(PAD_BEFORE_S * sampleRate));
  const end = Math.min(
    input.length,
    (last + 1) * win + Math.round(PAD_AFTER_S * sampleRate),
  );
  const out = input.slice(start, end);

  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? dbToGain(TARGET_PEAK_DB) / peak : 1;
  const fadeIn = Math.min(out.length, Math.round(0.01 * sampleRate));
  const fadeOut = Math.min(out.length, Math.round(0.04 * sampleRate));
  for (let i = 0; i < out.length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    const fromEnd = out.length - 1 - i;
    if (fromEnd < fadeOut) g *= fromEnd / fadeOut;
    out[i] *= g;
  }
  return { samples: out, sampleRate, durationS: out.length / sampleRate, silent: false };
}

/** 16-bit PCM mono WAV file bytes. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

/** True when bytes look like the WAV files encodeWav makes. */
export function looksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44) return false;
  const tag = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  return tag(0) === "RIFF" && tag(8) === "WAVE" && tag(12) === "fmt ";
}

/** Longest clip the studio will save (a single syllable never needs more). */
export const MAX_CLIP_SECONDS = 4;
