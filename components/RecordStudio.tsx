"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { startRecording, type RecordingHandle } from "@/lib/audio";
import {
  CLIP_SAMPLE_RATE,
  MAX_CLIP_SECONDS,
  cleanClip,
  encodeWav,
  resample,
  toMono,
} from "@/lib/clip";

/**
 * Recording studio: every letter on one page. For each: how to say it, the
 * sound learners hear now, record, listen back, save. Takes are trimmed and
 * levelled in the browser and saved as WAV through /api/save-audio, which
 * commits them and points the lesson at the new clip (live in ~1 minute).
 */

export interface StudioLetter {
  id: string;
  glyph: string;
  phonetic: string;
  audio: string;
  section: "vowel" | "consonant" | "other";
}

/** Same key as Author mode, so the password is entered once per session. */
const PASSWORD_STORAGE_KEY = "serpent_author_password";

type RowState =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "processing" }
  | { kind: "ready"; url: string; wav: Uint8Array; seconds: number }
  | { kind: "saving"; url: string; wav: Uint8Array; seconds: number }
  | { kind: "saved"; url: string }
  | { kind: "error"; message: string; url?: string; wav?: Uint8Array; seconds?: number };

/** A lesson audio path set by a saved recording carries a ?v= stamp. */
function isOwnVoice(audio: string): boolean {
  return audio.includes("?v=");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}

async function processTake(blob: Blob): Promise<{ wav: Uint8Array; seconds: number } | string> {
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
      decoded.getChannelData(i),
    );
    const mono = resample(toMono(channels), decoded.sampleRate, CLIP_SAMPLE_RATE);
    const clip = cleanClip(mono, CLIP_SAMPLE_RATE);
    if (clip.silent) return "No voice heard. Check the microphone and try again.";
    if (clip.durationS > MAX_CLIP_SECONDS) {
      return "That take is long. Say only the one sound, then stop.";
    }
    return { wav: encodeWav(clip.samples, clip.sampleRate), seconds: clip.durationS };
  } catch {
    return "Could not read the recording. Try again.";
  } finally {
    void ctx.close();
  }
}

export default function RecordStudio({ letters }: { letters: StudioLetter[] }) {
  const [password, setPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const handleRef = useRef<RecordingHandle | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(PASSWORD_STORAGE_KEY);
      if (stored) {
        setPassword(stored);
        setPasswordSaved(true);
      }
    } catch {
      // sessionStorage blocked: the password is typed each visit.
    }
    return () => handleRef.current?.cancel();
  }, []);

  const setRow = (id: string, state: RowState) =>
    setRows((prev) => ({ ...prev, [id]: state }));

  const play = (url: string) => {
    playerRef.current?.pause();
    const a = new Audio(url);
    playerRef.current = a;
    void a.play().catch(() => undefined);
  };

  const rememberPassword = () => {
    try {
      window.sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
    } catch {
      // still works in memory for this visit
    }
    setPasswordSaved(true);
  };

  const start = useCallback(async (id: string) => {
    if (handleRef.current) return;
    playerRef.current?.pause();
    try {
      handleRef.current = await startRecording();
      setActiveId(id);
      setRow(id, { kind: "recording" });
    } catch {
      setRow(id, {
        kind: "error",
        message: "The microphone is blocked. Allow it in the browser and try again.",
      });
    }
  }, []);

  const stop = useCallback(async (id: string) => {
    const handle = handleRef.current;
    if (!handle) return;
    handleRef.current = null;
    setActiveId(null);
    setRow(id, { kind: "processing" });
    try {
      const recorded = await handle.stop();
      URL.revokeObjectURL(recorded.url);
      const result = await processTake(recorded.blob);
      if (typeof result === "string") {
        setRow(id, { kind: "error", message: result });
        return;
      }
      const url = URL.createObjectURL(new Blob([result.wav.buffer as ArrayBuffer], { type: "audio/wav" }));
      setRow(id, { kind: "ready", url, wav: result.wav, seconds: result.seconds });
      play(url);
    } catch {
      setRow(id, { kind: "error", message: "Nothing was recorded. Try again." });
    }
  }, []);

  const save = async (letter: StudioLetter) => {
    const row = rows[letter.id];
    if (!row || !("wav" in row) || !row.wav || !row.url) return;
    if (!password) {
      setRow(letter.id, { ...row, kind: "error", message: "Enter the author password at the top first." } as RowState);
      return;
    }
    const { url, wav, seconds } = row as { url: string; wav: Uint8Array; seconds: number };
    setRow(letter.id, { kind: "saving", url, wav, seconds });
    try {
      const res = await fetch("/api/save-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: letter.id,
          password,
          mimeType: "audio/wav",
          data: toBase64(wav),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        try {
          window.sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
        } catch {
          // ignore
        }
        setPasswordSaved(false);
      }
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`);
      setRow(letter.id, { kind: "saved", url });
    } catch (err) {
      setRow(letter.id, {
        kind: "error",
        message: err instanceof Error ? err.message : "Save failed. Try again.",
        url,
        wav,
        seconds,
      });
    }
  };

  const groups: { title: string; key: StudioLetter["section"] }[] = [
    { title: "Vowels · உயிர்", key: "vowel" },
    { title: "Consonants · மெய்", key: "consonant" },
    { title: "Other", key: "other" },
  ];
  const savedCount = Object.values(rows).filter((r) => r.kind === "saved").length;
  const ownCount = letters.filter((l) => isOwnVoice(l.audio)).length;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-blob bg-cream-soft p-4 shadow-leaf">
        <h2 className="font-ui text-base font-extrabold text-forest">How to record</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 font-ui text-sm leading-relaxed text-forest">
          <li>Use your phone, in a quiet room, about a hand&apos;s width from your mouth.</li>
          <li>Tap <b>Record</b>, wait a moment, say the letter once, clearly, as a teacher would to a child. Tap <b>Stop</b>.</li>
          <li>It plays back, trimmed and levelled. Not happy? Record again. Happy? Tap <b>Save</b>.</li>
          <li>Saved letters are live in the app about a minute later.</li>
        </ol>
        <label htmlFor="studio-password" className="mt-3 block font-ui text-sm font-bold text-forest">
          Author password
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="studio-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPasswordSaved(false);
            }}
            className="min-w-0 flex-1 rounded-2xl border-2 border-sage-200 bg-cream px-3 py-2 font-ui text-base text-forest"
          />
          <button
            type="button"
            onClick={rememberPassword}
            disabled={!password}
            className="rounded-2xl bg-forest px-4 font-ui text-sm font-bold text-cream disabled:opacity-40"
          >
            {passwordSaved ? "Saved ✓" : "Use"}
          </button>
        </div>
        <p className="mt-2 font-ui text-xs text-forest-soft">
          Your voice: {ownCount + savedCount} of {letters.length} letters
          {savedCount > 0 ? ` (${savedCount} saved now)` : ""}.
        </p>
      </section>

      {groups.map((group) => {
        const items = letters.filter((l) => l.section === group.key);
        if (items.length === 0) return null;
        return (
          <section key={group.key} className="flex flex-col gap-3">
            <h2 className="font-ui text-sm font-extrabold uppercase tracking-widest text-wisdom-deep">
              {group.title}
            </h2>
            {items.map((letter) => {
              const row = rows[letter.id] ?? { kind: "idle" };
              const recording = row.kind === "recording";
              const busy = activeId !== null && activeId !== letter.id;
              const takeUrl = "url" in row ? row.url : undefined;
              const hasTake = row.kind === "ready" || (row.kind === "error" && !!row.wav);
              const own = isOwnVoice(letter.audio) || row.kind === "saved";
              return (
                <article
                  key={letter.id}
                  className={`rounded-blob border-2 bg-cream-soft p-4 shadow-leaf ${
                    recording ? "border-serpent-deep" : row.kind === "saved" ? "border-forest" : "border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className="w-16 text-center font-tamil text-5xl font-bold leading-none text-forest">
                      {letter.glyph}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-ui text-xs font-bold uppercase tracking-wide text-forest-soft">Say</p>
                      <p className="font-ui text-lg font-extrabold text-serpent-deep">{letter.phonetic}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 font-ui text-[11px] font-extrabold ${
                          own ? "bg-forest text-cream" : "bg-wisdom-soft text-wisdom-deep"
                        }`}
                      >
                        {own ? "Your voice" : "AI voice now"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => play(letter.audio)}
                      aria-label={`Play the sound learners hear now for ${letter.glyph}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream font-ui text-lg text-forest shadow-node"
                    >
                      ▶
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {recording ? (
                      <button
                        type="button"
                        onClick={() => void stop(letter.id)}
                        className="rounded-full bg-serpent-deep px-5 py-2.5 font-ui text-sm font-extrabold text-cream"
                      >
                        ■ Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy || row.kind === "processing" || row.kind === "saving"}
                        onClick={() => void start(letter.id)}
                        className="rounded-full bg-forest px-5 py-2.5 font-ui text-sm font-extrabold text-cream disabled:opacity-40"
                      >
                        ● {hasTake || row.kind === "saved" ? "Record again" : "Record"}
                      </button>
                    )}
                    {takeUrl && !recording && (
                      <button
                        type="button"
                        onClick={() => play(takeUrl)}
                        className="rounded-full border-2 border-forest px-4 py-2 font-ui text-sm font-bold text-forest"
                      >
                        ▶ My take
                      </button>
                    )}
                    {(hasTake || row.kind === "saving") && (
                      <button
                        type="button"
                        disabled={row.kind === "saving"}
                        onClick={() => void save(letter)}
                        className="rounded-full bg-serpent px-5 py-2.5 font-ui text-sm font-extrabold text-forest-deep shadow-node disabled:opacity-60"
                      >
                        {row.kind === "saving" ? "Saving…" : "Save"}
                      </button>
                    )}
                  </div>

                  <p className="mt-2 min-h-[1.25rem] font-ui text-xs font-semibold">
                    {recording && <span className="text-serpent-deep">Recording… say {letter.glyph} once, then Stop.</span>}
                    {row.kind === "processing" && <span className="text-forest-soft">Trimming and levelling…</span>}
                    {row.kind === "ready" && (
                      <span className="text-forest-soft">{row.seconds.toFixed(1)} s, trimmed and levelled. Listen, then Save.</span>
                    )}
                    {row.kind === "saved" && <span className="text-forest">Saved ✓ Live in the app in about a minute.</span>}
                    {row.kind === "error" && <span className="text-serpent-deep">{row.message}</span>}
                  </p>
                </article>
              );
            })}
          </section>
        );
      })}

      <Link href="/author" className="text-center font-ui text-sm font-bold text-forest underline underline-offset-4">
        ← Author mode (tracing)
      </Link>
    </div>
  );
}
