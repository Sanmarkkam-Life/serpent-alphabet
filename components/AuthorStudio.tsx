"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Lesson, NormalizedPoint } from "@/lib/types";
import {
  TRACE_CANVAS_ASPECT,
  normalizePath,
  simplifyNormalizedPath,
  toPixelPath,
  type PixelPoint,
} from "@/lib/trace";
import {
  extensionForMime,
  isRecordingSupported,
  startRecording,
  type RecordedAudio,
  type RecordingHandle,
} from "@/lib/audio";
import TraceTask from "@/components/TraceTask";
import { Button, Card } from "@/components/ui";

/**
 * Author Studio — records normalized trace paths and reference audio for
 * lessons. Uses the exact same canvas geometry (TRACE_CANVAS_ASPECT, dpr
 * scaling) as the learner-facing trace screen, so a path recorded here lands
 * identically on every device.
 */

export interface AuthorStudioProps {
  lessons: Lesson[];
}

type StudioMode = "record" | "test";
type TestOutcome = "passed" | "failed" | null;

const PREVIEW_DURATION_MS = 2000;
const STROKE_COLOR = "#F5A94B"; // serpent
const GLYPH_COLOR = "rgba(46, 91, 62, 0.12)"; // faint forest
const CANVAS_BG = "#FAF6EC"; // cream-soft
const FALLBACK_FONT = '"Noto Sans Tamil", "Latha", system-ui, sans-serif';

export default function AuthorStudio({ lessons }: AuthorStudioProps) {
  const [selectedId, setSelectedId] = useState<string>(lessons[0]?.id ?? "");
  const [recordedPath, setRecordedPath] = useState<NormalizedPoint[] | null>(
    null,
  );
  const [mode, setMode] = useState<StudioMode>("record");
  const [testOutcome, setTestOutcome] = useState<TestOutcome>(null);
  const [testKey, setTestKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [fontFamily, setFontFamily] = useState<string>(FALLBACK_FONT);
  const [fontsReady, setFontsReady] = useState(false);

  // Audio recorder state
  const [recordingSupported, setRecordingSupported] = useState<boolean | null>(
    null,
  );
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recording, setRecording] = useState<RecordedAudio | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Refs for hot paths / cleanup
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fontProbeRef = useRef<HTMLSpanElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const pointsRef = useRef<PixelPoint[]>([]);
  const isDrawingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const audioHandleRef = useRef<RecordingHandle | null>(null);
  const recordingRef = useRef<RecordedAudio | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);

  const selectedLesson =
    lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0] ?? null;

  /* ---------------------------------------------------------------- */
  /* Canvas drawing                                                    */
  /* ---------------------------------------------------------------- */

  const strokePoints = useCallback(
    (ctx: CanvasRenderingContext2D, pts: readonly PixelPoint[]) => {
      if (pts.length === 0) return;
      ctx.strokeStyle = STROKE_COLOR;
      ctx.fillStyle = STROKE_COLOR;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      // Start marker so the stroke direction is obvious to the author.
      ctx.fillStyle = "#2E5B3E";
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    },
    [],
  );

  const draw = useCallback(
    (livePx?: readonly PixelPoint[]) => {
      const canvas = canvasRef.current;
      const { w, h, dpr } = sizeRef.current;
      if (!canvas || w === 0 || h === 0 || !selectedLesson) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, w, h);

      // Large faint glyph filling ~80% of the canvas height.
      let size = h * 0.8;
      ctx.font = `700 ${size}px ${fontFamily}`;
      const width = ctx.measureText(selectedLesson.glyph).width;
      if (width > w * 0.9) {
        size = (size * (w * 0.9)) / width;
        ctx.font = `700 ${size}px ${fontFamily}`;
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = GLYPH_COLOR;
      ctx.fillText(selectedLesson.glyph, w / 2, h / 2);

      const pts =
        livePx ?? (recordedPath ? toPixelPath(recordedPath, w, h) : null);
      if (pts) strokePoints(ctx, pts);
    },
    [selectedLesson, recordedPath, fontFamily, strokePoints],
  );

  // Resolve the Tamil webfont for ctx.font, and redraw once fonts load.
  useEffect(() => {
    const probe = fontProbeRef.current;
    if (probe) {
      const family = getComputedStyle(probe).fontFamily;
      if (family) setFontFamily(family);
    }
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        /* fonts API unavailable — fallback font already drawn */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Size the canvas: capped width (max-w-md wrapper), fixed aspect, dpr.
  useEffect(() => {
    if (mode !== "record") return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const apply = () => {
      const cssW = wrap.clientWidth;
      if (cssW === 0) return;
      const cssH = Math.round(cssW / TRACE_CANVAS_ASPECT);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      sizeRef.current = { w: cssW, h: cssH, dpr };
      setCanvasSize({ w: cssW, h: cssH });
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [mode]);

  // Redraw whenever the scene inputs change (size, lesson, path, fonts).
  // Skipped mid-gesture — pointer handlers own the canvas while drawing.
  useEffect(() => {
    if (mode !== "record" || isDrawingRef.current) return;
    draw();
  }, [draw, mode, canvasSize, fontsReady]);

  const cancelPreview = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Pointer tracing (one continuous stroke)                           */
  /* ---------------------------------------------------------------- */

  const pointFromEvent = (
    e: ReactPointerEvent<HTMLCanvasElement>,
  ): PixelPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    cancelPreview();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    pointsRef.current = [pointFromEvent(e)];
    setRecordedPath(null); // retracing replaces the previous stroke
    draw(pointsRef.current);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    pointsRef.current.push(pointFromEvent(e));
    draw(pointsRef.current);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    pointsRef.current.push(pointFromEvent(e));
    const { w, h } = sizeRef.current;
    const normalized = simplifyNormalizedPath(
      normalizePath(pointsRef.current, w, h),
    );
    pointsRef.current = [];
    if (normalized.length >= 2) {
      setRecordedPath(normalized);
    } else {
      setRecordedPath(null);
      draw();
    }
  };

  const handlePointerCancel = () => {
    isDrawingRef.current = false;
    pointsRef.current = [];
    draw();
  };

  const handleClear = () => {
    cancelPreview();
    pointsRef.current = [];
    isDrawingRef.current = false;
    setRecordedPath(null);
  };

  /* ---------------------------------------------------------------- */
  /* Preview / copy / test                                             */
  /* ---------------------------------------------------------------- */

  const handlePreview = () => {
    if (!recordedPath) return;
    cancelPreview();
    const { w, h } = sizeRef.current;
    const px = toPixelPath(recordedPath, w, h);
    if (px.length < 2) return;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / PREVIEW_DURATION_MS);
      const count = Math.max(2, Math.ceil(px.length * t));
      draw(px.slice(0, count));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const handleCopy = async () => {
    if (!recordedPath) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(recordedPath));
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail on http / without permission — the readonly
      // textarea below is the manual fallback.
    }
  };

  const handleTest = () => {
    if (!recordedPath) return;
    cancelPreview();
    setTestOutcome(null);
    setTestKey((k) => k + 1);
    setMode("test");
  };

  const handleSelectLesson = (id: string) => {
    cancelPreview();
    pointsRef.current = [];
    isDrawingRef.current = false;
    setSelectedId(id);
    setRecordedPath(null);
    setTestOutcome(null);
    setMode("record");
  };

  /* ---------------------------------------------------------------- */
  /* Reference audio                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setRecordingSupported(isRecordingSupported());
  }, []);

  const handleStartAudio = async () => {
    setAudioError(null);
    try {
      const handle = await startRecording();
      audioHandleRef.current = handle;
      setIsRecordingAudio(true);
    } catch (err) {
      setAudioError(
        err instanceof Error
          ? err.message
          : "Could not start recording — check microphone permission.",
      );
    }
  };

  const handleStopAudio = async () => {
    const handle = audioHandleRef.current;
    if (!handle) return;
    audioHandleRef.current = null;
    setIsRecordingAudio(false);
    try {
      const recorded = await handle.stop();
      playbackRef.current?.pause();
      playbackRef.current = null;
      if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url);
      recordingRef.current = recorded;
      setRecording(recorded);
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : "Recording failed — try again.",
      );
    }
  };

  const handlePlayRecording = () => {
    const recorded = recordingRef.current;
    if (!recorded) return;
    playbackRef.current?.pause();
    const audio = new Audio(recorded.url);
    playbackRef.current = audio;
    void audio.play().catch(() => {
      setAudioError("Playback failed — try the download link instead.");
    });
  };

  /* ---------------------------------------------------------------- */
  /* Unmount cleanup                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      audioHandleRef.current?.cancel();
      playbackRef.current?.pause();
      if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (!selectedLesson) {
    return (
      <Card>
        <p className="font-ui text-forest">
          No lessons found in /content/lessons/. Add a lesson JSON file first.
        </p>
      </Card>
    );
  }

  const existingCount = selectedLesson.trace_path.length;

  if (mode === "test" && recordedPath) {
    const testLesson: Lesson = { ...selectedLesson, trace_path: recordedPath };
    return (
      <div className="space-y-4">
        <Card>
          <p className="font-ui text-sm font-bold text-forest">
            Testing recorded path for{" "}
            <span className="font-tamil">{selectedLesson.glyph}</span> (
            {selectedLesson.id}) — {recordedPath.length} points
          </p>
        </Card>
        {testOutcome === null ? (
          <TraceTask
            key={testKey}
            lesson={testLesson}
            onPass={() => setTestOutcome("passed")}
            onFail={() => setTestOutcome("failed")}
            isRedeeming={false}
          />
        ) : (
          <Card className="animate-pop-in">
            <p
              className={`text-center font-ui text-3xl font-bold ${
                testOutcome === "passed" ? "text-forest" : "text-serpent-deep"
              }`}
            >
              {testOutcome === "passed" ? "PASSED ✓" : "FAILED ✗"}
            </p>
            <div className="mt-5 space-y-3">
              <Button
                fullWidth
                onClick={() => {
                  setTestOutcome(null);
                  setTestKey((k) => k + 1);
                }}
              >
                Test again
              </Button>
              <Button
                fullWidth
                variant="secondary"
                onClick={() => setMode("record")}
              >
                Back to recording
              </Button>
            </div>
          </Card>
        )}
        {testOutcome === null && (
          <Button
            fullWidth
            variant="ghost"
            onClick={() => setMode("record")}
          >
            Back to recording
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hidden probe: resolves the next/font Tamil family for ctx.font. */}
      <span
        ref={fontProbeRef}
        aria-hidden="true"
        className="font-tamil"
        style={{ position: "absolute", visibility: "hidden" }}
      >
        {selectedLesson.glyph}
      </span>

      <Card>
        <p className="font-ui text-sm text-forest">
          Trace the letter with <strong>one continuous stroke</strong>, exactly
          the way a learner should write it. If possible, record on a phone —
          this canvas has the same geometry learners see.
        </p>
      </Card>

      {/* Lesson picker */}
      <section>
        <label
          htmlFor="author-lesson-select"
          className="mb-1 block font-ui text-sm font-bold text-forest"
        >
          Lesson
        </label>
        <select
          id="author-lesson-select"
          value={selectedLesson.id}
          onChange={(e) => handleSelectLesson(e.target.value)}
          className="min-h-[48px] w-full rounded-blob border-2 border-sage-300 bg-cream-soft px-4 font-tamil text-lg text-forest"
        >
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.glyph} — {lesson.id}
            </option>
          ))}
        </select>
        <p className="mt-1 font-ui text-xs text-forest-soft">
          {existingCount > 0
            ? `${existingCount} points recorded`
            : "no trace path yet"}
        </p>
      </section>

      {/* Recording canvas */}
      <section ref={wrapRef} className="w-full max-w-md">
        <canvas
          ref={canvasRef}
          className="touch-none-strict w-full rounded-blob border-2 border-sage-300 shadow-leaf"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-ui text-sm text-forest">
            {recordedPath
              ? `Recorded: ${recordedPath.length} points`
              : "No stroke recorded yet — draw on the canvas."}
          </p>
          <Button
            variant="secondary"
            onClick={handleClear}
            disabled={!recordedPath}
            className="shrink-0"
          >
            Clear
          </Button>
        </div>
      </section>

      {/* Actions */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={handlePreview}
            disabled={!recordedPath}
            className="flex-1"
          >
            Preview
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleCopy()}
            disabled={!recordedPath}
            className="flex-1"
          >
            {copied ? "Copied!" : "Copy JSON"}
          </Button>
          <Button
            onClick={handleTest}
            disabled={!recordedPath}
            className="flex-1"
          >
            Test it
          </Button>
        </div>
        {recordedPath && (
          <div>
            <label
              htmlFor="author-json-out"
              className="mb-1 block font-ui text-xs font-bold text-forest"
            >
              trace_path JSON (manual copy fallback)
            </label>
            <textarea
              id="author-json-out"
              readOnly
              rows={4}
              value={JSON.stringify(recordedPath)}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-xl border-2 border-sage-300 bg-cream-soft p-2 font-mono text-xs text-forest"
            />
          </div>
        )}
      </section>

      {/* Reference audio recorder */}
      <section>
        <h2 className="mb-2 font-ui text-lg font-bold text-forest">
          Reference audio
        </h2>
        {recordingSupported === false ? (
          <Card>
            <p className="font-ui text-sm text-forest">
              Audio recording is not supported in this browser. Try Chrome on
              Android or Safari on iOS, or record with any voice-memo app and
              drop the file into /public/audio/ yourself.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {isRecordingAudio ? (
              <Button fullWidth onClick={() => void handleStopAudio()}>
                <span className="inline-block h-3 w-3 animate-shimmer rounded-full bg-forest-deep" />
                Stop recording
              </Button>
            ) : (
              <Button
                fullWidth
                variant="secondary"
                onClick={() => void handleStartAudio()}
                disabled={recordingSupported === null}
              >
                {recording ? "Record again" : "Start recording"}
              </Button>
            )}
            {audioError && (
              <p className="font-ui text-sm text-serpent-deep">{audioError}</p>
            )}
            {recording && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={handlePlayRecording}
                    className="flex-1"
                  >
                    Play
                  </Button>
                  <a
                    href={recording.url}
                    download={`${selectedLesson.id}.${extensionForMime(recording.mimeType)}`}
                    className="inline-flex min-h-[52px] flex-1 items-center justify-center rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-bold text-forest-deep shadow-node active:translate-y-1 active:shadow-none"
                  >
                    Download recording
                  </a>
                </div>
                <p className="font-ui text-xs text-forest-soft">
                  Drop the file into /public/audio/ and set the lesson JSON
                  &quot;audio&quot; field to match (e.g.
                  &quot;/audio/a.m4a&quot;). Browsers record m4a/webm — either
                  plays fine; convert to mp3 only if you prefer.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
