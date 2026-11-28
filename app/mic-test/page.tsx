"use client";

import { useRef, useState } from "react";
import { isRecordingSupported, pickMimeType } from "@/lib/audio";

/**
 * /mic-test: a step-by-step check of "Record yourself / Hear yourself" on a
 * phone. Every step prints what happened, so a screenshot shows where it
 * breaks. Not linked from the learner UI.
 */
export default function MicTestPage() {
  const [log, setLog] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "recording" | "done">("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const urlRef = useRef<string | null>(null);
  const add = (line: string) => setLog((l) => [...l, line]);

  const start = async () => {
    setLog([]);
    add(`Browser: ${navigator.userAgent}`);
    add(`In a frame: ${window.self !== window.top ? "yes" : "no"}`);
    add(`Recording supported: ${isRecordingSupported() ? "yes" : "NO"}`);
    const mime = pickMimeType();
    add(`Format chosen: ${mime || "(browser default)"}`);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      add(`Microphone: OK (${track?.label || "no name"}, ${track?.readyState})`);
    } catch (e) {
      const err = e as Error;
      add(`Microphone: FAILED (${err.name}: ${err.message})`);
      return;
    }
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      add(`Recorder: FAILED (${(e as Error).message})`);
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    rec.ondataavailable = (ev) => {
      chunks.push(ev.data);
      add(`Got a piece of sound: ${ev.data.size} bytes`);
    };
    rec.onerror = () => add("Recorder error event");
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mime });
      add(`Stopped. Total: ${blob.size} bytes, type "${blob.type}"`);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(blob);
      setState("done");
    };
    rec.start(250);
    recRef.current = rec;
    setState("recording");
    add("Recording… say something, then tap Stop.");
  };

  const stop = () => recRef.current?.state === "recording" && recRef.current.stop();

  const play = () => {
    if (!urlRef.current) return;
    const a = new Audio(urlRef.current);
    a.onloadedmetadata = () => add(`Length: ${Number.isFinite(a.duration) ? a.duration.toFixed(1) + " s" : String(a.duration)}`);
    a.onerror = () => add(`Playback error: code ${a.error?.code} ${a.error?.message ?? ""}`);
    a.onended = () => add("Playback finished.");
    a.play()
      .then(() => add("Playing… do you hear yourself?"))
      .catch((e: Error) => add(`Play FAILED (${e.name}: ${e.message})`));
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="font-ui text-2xl font-bold text-forest">Microphone test</h1>
      <p className="mt-1 font-ui text-sm text-forest-soft">
        Tap Record, say something, tap Stop, then Play. Take a screenshot of the result and send it.
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => void start()} disabled={state === "recording"} className="min-h-[52px] flex-1 rounded-blob bg-serpent font-ui font-bold text-forest-deep disabled:opacity-40">
          🎙 Record
        </button>
        <button type="button" onClick={stop} disabled={state !== "recording"} className="min-h-[52px] flex-1 rounded-blob bg-sage-100 font-ui font-bold text-forest disabled:opacity-40">
          ⏹ Stop
        </button>
        <button type="button" onClick={play} disabled={state !== "done"} className="min-h-[52px] flex-1 rounded-blob bg-wisdom font-ui font-bold text-white disabled:opacity-40">
          ▶ Play
        </button>
      </div>
      <ol className="mt-4 space-y-1 break-words rounded-2xl bg-cream-soft p-3 font-mono text-xs text-forest">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </main>
  );
}
