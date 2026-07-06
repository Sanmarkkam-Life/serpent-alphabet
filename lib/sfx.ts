"use client";

import { loadProgress } from "./progress";

/**
 * Feedback sounds and haptics. All sounds are synthesized with WebAudio
 * (no asset files): quiet and warm, never harsh.
 *
 * The mute preference (progress.mute) silences THESE sounds only. It must
 * never touch the reference pronunciation audio, which is core learning
 * content and plays through ordinary HTMLAudioElements elsewhere.
 *
 * Haptics are separate from mute: they are already silent.
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** True when feedback SFX should stay silent. */
function sfxMuted(): boolean {
  return loadProgress().mute;
}

/**
 * All play functions are called from user-gesture handlers (pass/fail
 * taps), so resuming a suspended context here satisfies autoplay rules.
 */
function withContext(play: (ac: AudioContext, now: number) => void): void {
  if (sfxMuted()) return;
  const ac = audioContext();
  if (!ac) return;
  const start = () => {
    try {
      play(ac, ac.currentTime);
    } catch {
      // A blocked or torn-down context must never break the lesson.
    }
  };
  if (ac.state === "suspended") {
    ac.resume().then(start, () => {});
  } else {
    start();
  }
}

/** Reusable 0.15s white-noise buffer for the shaker hiss. */
let noiseBuffer: AudioBuffer | null = null;

function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ac.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.floor(ac.sampleRate * 0.15);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

/** Task pass: a soft, short hiss/shaker, like a happy snake. */
export function playPassSound(): void {
  withContext((ac, now) => {
    const source = ac.createBufferSource();
    source.buffer = getNoiseBuffer(ac);

    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(5200, now);
    filter.Q.setValueAtTime(1.2, now);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    source.connect(filter).connect(gain).connect(ac.destination);
    source.start(now);
    source.stop(now + 0.15);
  });
}

/** Task fail: a gentle low thud. Sympathetic, not punishing. */
export function playFailSound(): void {
  withContext((ac, now) => {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.16);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  });
}

/** Lesson complete / level-up: a small warm chime arpeggio. */
export function playFanfareSound(): void {
  withContext((ac, now) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((frequency, i) => {
      const at = now + i * 0.09;
      const osc = ac.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, at);

      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.07, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.55);

      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.6);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Haptics (feature-detected; iOS Safari has no vibrate, degrade      */
/* silently). Not affected by the SFX mute: vibration is silent.      */
/* ------------------------------------------------------------------ */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw on vibrate without a user gesture; ignore.
  }
}

/** Combined pass feedback: soft hiss + short buzz. */
export function feedbackPass(): void {
  playPassSound();
  vibrate(30);
}

/** Combined fail feedback: low thud + double buzz. */
export function feedbackFail(): void {
  playFailSound();
  vibrate([20, 40, 20]);
}

/** Lesson complete / level-up moment. */
export function feedbackFanfare(): void {
  playFanfareSound();
  vibrate(30);
}
