"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  audioFileExists,
  isRecordingSupported,
  startRecording,
  type RecordedAudio,
  type RecordingHandle,
} from "@/lib/audio";
import type { Lesson } from "@/lib/types";

/**
 * Pronounce task — hear the teacher say the letter, record yourself, compare,
 * then honestly self-assess. Degrades gracefully when the reference audio is
 * missing (say-it-aloud mode) or the microphone is unavailable (practice-aloud
 * mode); it must never crash on a denied permission or a 404.
 */

export interface TaskComponentProps {
  lesson: Lesson;
  onPass: () => void;
  onFail: () => void;
  isRedeeming: boolean;
}

type ReferenceStatus = "checking" | "available" | "missing";
type RecordingState = "idle" | "recording" | "recorded";

export default function PronounceTask({
  lesson,
  onPass,
  onFail,
  isRedeeming,
}: TaskComponentProps) {
  const [refStatus, setRefStatus] = useState<ReferenceStatus>("checking");
  const [refPlaying, setRefPlaying] = useState(false);
  const [hasPlayedReference, setHasPlayedReference] = useState(false);
  const [micFallback, setMicFallback] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recorded, setRecorded] = useState<RecordedAudio | null>(null);
  const [selfPlaying, setSelfPlaying] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refAudioRef = useRef<HTMLAudioElement | null>(null);
  const selfAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingHandleRef = useRef<RecordingHandle | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const decidedRef = useRef(false);
  const busyRef = useRef(false);

  // Unmount cleanup: cancel any in-flight recording, silence audio, free blobs.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingHandleRef.current?.cancel();
      recordingHandleRef.current = null;
      refAudioRef.current?.pause();
      selfAudioRef.current?.pause();
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
        recordedUrlRef.current = null;
      }
    };
  }, []);

  // Detect an unsupported browser up front (in an effect to stay SSR-safe).
  useEffect(() => {
    if (!isRecordingSupported()) setMicFallback(true);
  }, []);

  // Check whether the reference audio actually exists.
  useEffect(() => {
    let cancelled = false;
    audioFileExists(lesson.audio).then((exists) => {
      if (!cancelled) setRefStatus(exists ? "available" : "missing");
    });
    return () => {
      cancelled = true;
    };
  }, [lesson.audio]);

  const markReferenceMissing = useCallback(() => {
    if (!mountedRef.current) return;
    setRefStatus("missing");
    setRefPlaying(false);
  }, []);

  const playReference = useCallback(() => {
    let element = refAudioRef.current;
    if (!element) {
      element = new Audio(lesson.audio);
      element.preload = "auto";
      element.onended = () => {
        if (mountedRef.current) setRefPlaying(false);
      };
      element.onerror = () => markReferenceMissing();
      refAudioRef.current = element;
    }
    selfAudioRef.current?.pause();
    setSelfPlaying(false);
    element.currentTime = 0;
    element
      .play()
      .then(() => {
        if (!mountedRef.current) return;
        setRefPlaying(true);
        setHasPlayedReference(true);
      })
      .catch(() => markReferenceMissing());
  }, [lesson.audio, markReferenceMissing]);

  const playSelf = useCallback(() => {
    if (!recorded) return;
    let element = selfAudioRef.current;
    if (!element) {
      element = new Audio();
      element.onended = () => {
        if (mountedRef.current) setSelfPlaying(false);
      };
      element.onerror = () => {
        if (mountedRef.current) setSelfPlaying(false);
      };
      selfAudioRef.current = element;
    }
    if (element.src !== recorded.url) {
      element.src = recorded.url;
    }
    refAudioRef.current?.pause();
    setRefPlaying(false);
    element.currentTime = 0;
    element
      .play()
      .then(() => {
        if (mountedRef.current) setSelfPlaying(true);
      })
      .catch(() => {
        if (mountedRef.current) setSelfPlaying(false);
      });
  }, [recorded]);

  const beginRecording = useCallback(async () => {
    if (busyRef.current || recordingHandleRef.current) return;
    busyRef.current = true;
    setNote(null);
    refAudioRef.current?.pause();
    setRefPlaying(false);
    selfAudioRef.current?.pause();
    setSelfPlaying(false);
    try {
      const handle = await startRecording();
      if (!mountedRef.current) {
        handle.cancel();
        return;
      }
      recordingHandleRef.current = handle;
      setRecordingState("recording");
    } catch {
      // Permission denied or recording unsupported — calm fallback, no crash.
      if (mountedRef.current) {
        setMicFallback(true);
        setRecordingState("idle");
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  const finishRecording = useCallback(async () => {
    const handle = recordingHandleRef.current;
    if (!handle || busyRef.current) return;
    busyRef.current = true;
    recordingHandleRef.current = null;
    try {
      const result = await handle.stop();
      if (!mountedRef.current) {
        URL.revokeObjectURL(result.url);
        return;
      }
      if (recordedUrlRef.current) {
        URL.revokeObjectURL(recordedUrlRef.current);
      }
      recordedUrlRef.current = result.url;
      setRecorded(result);
      setRecordingState("recorded");
    } catch {
      if (mountedRef.current) {
        setRecordingState(recordedUrlRef.current ? "recorded" : "idle");
        setNote("That take didn't record — give it one more try.");
      }
    } finally {
      busyRef.current = false;
    }
  }, []);

  const decide = useCallback(
    (passed: boolean) => {
      if (decidedRef.current) return;
      decidedRef.current = true;
      recordingHandleRef.current?.cancel();
      recordingHandleRef.current = null;
      refAudioRef.current?.pause();
      selfAudioRef.current?.pause();
      if (passed) {
        onPass();
      } else {
        onFail();
      }
    },
    [onPass, onFail],
  );

  // The learner has "engaged" once they heard the teacher, recorded
  // themselves, or landed in a fallback mode (no audio / no mic).
  const engaged =
    hasPlayedReference ||
    recorded !== null ||
    refStatus === "missing" ||
    micFallback;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 pt-2">
      {/* Glyph + phonetic header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <span
          role="img"
          aria-label={`Tamil letter, pronounced ${lesson.phonetic}`}
          className="animate-pop-in font-tamil text-7xl font-bold leading-none text-forest"
        >
          {lesson.glyph}
        </span>
        <span className="font-ui text-xl font-extrabold text-forest-soft">
          sounds like{" "}
          <span className="text-serpent-deep">{lesson.phonetic}</span>
        </span>
      </div>

      {/* Teacher side */}
      <Card className="flex flex-col items-center gap-4 text-center">
        <h2 className="font-ui text-sm font-extrabold uppercase tracking-wide text-forest-soft">
          {refStatus === "missing" ? "Say it aloud" : "Hear the teacher"}
        </h2>

        {refStatus === "checking" && (
          <div
            className="h-20 w-20 animate-shimmer rounded-full bg-sage-200"
            aria-hidden="true"
          />
        )}

        {refStatus === "available" && (
          <button
            type="button"
            onClick={playReference}
            aria-label={`Play the teacher saying ${lesson.phonetic}`}
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-serpent text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none"
          >
            {refPlaying && (
              <span
                className="absolute inset-0 animate-ping rounded-full bg-serpent-soft opacity-70"
                aria-hidden="true"
              />
            )}
            <span
              className={`relative pl-1 text-3xl leading-none ${refPlaying ? "animate-shimmer" : ""}`}
              aria-hidden="true"
            >
              ▶
            </span>
          </button>
        )}

        {refStatus === "missing" && (
          <div className="flex flex-col items-center gap-3">
            <span className="font-ui text-6xl font-extrabold leading-none text-serpent">
              {lesson.phonetic}
            </span>
            <p className="font-ui text-base font-semibold text-forest">
              Say it aloud: {lesson.phonetic} — the sound of{" "}
              <span className="font-tamil font-bold">{lesson.glyph}</span>
            </p>
          </div>
        )}
      </Card>

      {/* Learner side */}
      <Card className="flex flex-col items-center gap-4 text-center">
        <h2 className="font-ui text-sm font-extrabold uppercase tracking-wide text-forest-soft">
          Hear yourself
        </h2>

        {micFallback ? (
          <p className="font-ui text-base leading-relaxed text-forest">
            No microphone? No problem — practice aloud a few times.
          </p>
        ) : recordingState === "recording" ? (
          <button
            type="button"
            onClick={finishRecording}
            className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-blob border-2 border-serpent-deep bg-cream px-6 py-3 font-ui text-lg font-bold text-forest"
          >
            <span className="relative flex h-4 w-4" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-serpent-deep opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-serpent-deep" />
            </span>
            Recording… tap to stop
          </button>
        ) : recorded ? (
          <>
            <div
              className={`grid w-full gap-3 ${
                refStatus === "available" ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {refStatus === "available" && (
                <button
                  type="button"
                  onClick={playReference}
                  className="flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-blob border-2 border-sage-300 bg-sage-100 p-3 active:bg-sage-200"
                >
                  <span
                    className={`text-2xl leading-none text-forest ${refPlaying ? "animate-shimmer" : ""}`}
                    aria-hidden="true"
                  >
                    ▶
                  </span>
                  <span className="font-ui text-sm font-bold text-forest">
                    Hear the teacher
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={playSelf}
                className="flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-blob border-2 border-serpent bg-serpent-soft p-3 active:bg-serpent"
              >
                <span
                  className={`text-2xl leading-none text-forest-deep ${selfPlaying ? "animate-shimmer" : ""}`}
                  aria-hidden="true"
                >
                  ▶
                </span>
                <span className="font-ui text-sm font-bold text-forest-deep">
                  Hear yourself
                </span>
              </button>
            </div>
            <Button
              variant="ghost"
              onClick={beginRecording}
              className="text-base"
            >
              Record again
            </Button>
          </>
        ) : (
          <Button variant="secondary" fullWidth onClick={beginRecording}>
            <span
              className="h-3 w-3 rounded-full bg-serpent-deep"
              aria-hidden="true"
            />
            Record yourself
          </Button>
        )}

        {note && (
          <p className="font-ui text-sm font-semibold text-forest-soft">
            {note}
          </p>
        )}
      </Card>

      {/* Self-assessment gate */}
      <div className="mt-auto pt-2">
        {engaged ? (
          <div className="flex animate-pop-in flex-col gap-3">
            <p className="text-center font-ui text-lg font-extrabold text-forest">
              {isRedeeming
                ? "One more clean match! Did you match the sound?"
                : "Did you match the sound?"}
            </p>
            <Button variant="primary" fullWidth onClick={() => decide(true)}>
              Yes, I matched it
            </Button>
            <Button variant="secondary" fullWidth onClick={() => decide(false)}>
              Let me try again
            </Button>
          </div>
        ) : (
          <p className="text-center font-ui text-base font-medium text-forest-soft">
            Listen first, then try it with your own voice.
          </p>
        )}
      </div>
    </div>
  );
}
