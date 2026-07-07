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
type SaveState = "idle" | "saving" | "saved" | "error";

interface LessonStatus {
  id: string;
  glyph: string;
  order: number;
  hasTrace: boolean;
  points: number;
}

/** Author password lives in sessionStorage only (never in the repo/bundle). */
const PASSWORD_STORAGE_KEY = "serpent_author_password";

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

  // Auto-sync state (status board + one-tap save to GitHub)
  const [traceStatus, setTraceStatus] = useState<LessonStatus[] | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [authorPassword, setAuthorPassword] = useState<string>("");
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  /* ---------------------------------------------------------------- */
  /* Auto-sync: status board + one-tap save                            */
  /* ---------------------------------------------------------------- */

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/trace-status", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Status request failed (${res.status})`);
      }
      setTraceStatus(Array.isArray(data.lessons) ? data.lessons : []);
      setStatusError(null);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Could not load trace status.",
      );
    }
  }, []);

  // On mount: restore the author password and load the live status board.
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(PASSWORD_STORAGE_KEY);
      if (stored) setAuthorPassword(stored);
    } catch {
      // sessionStorage may be unavailable; the author can re-enter it.
    }
    void refreshStatus();
  }, [refreshStatus]);

  // A freshly recorded/cleared path or a lesson switch clears stale save UI.
  useEffect(() => {
    setSaveState("idle");
    setSaveMessage(null);
  }, [recordedPath, selectedId]);

  const persistPassword = (pw: string) => {
    setAuthorPassword(pw);
    setChangingPassword(false);
    try {
      window.sessionStorage.setItem(PASSWORD_STORAGE_KEY, pw);
    } catch {
      // Non-fatal: the password still works for this session in memory.
    }
  };

  const handleSaveToGitHub = useCallback(async () => {
    if (!recordedPath || !selectedLesson) return;
    if (!authorPassword) {
      setSaveMessage("Enter the author password first.");
      return;
    }
    setSaveState("saving");
    setSaveMessage(null);
    try {
      const res = await fetch("/api/save-trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedLesson.id,
          trace_path: recordedPath,
          password: authorPassword,
        }),
      });
      if (res.status === 401) {
        setSaveState("error");
        setSaveMessage("Wrong author password. Enter it again.");
        setAuthorPassword("");
        try {
          window.sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
        } catch {
          // ignore
        }
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setSaveState("saved");
      setSaveMessage(
        `Saved ✓ ${data.points ?? recordedPath.length} points. Live in ~1 min after redeploy.`,
      );
      // Optimistic badge flip for the letter we just saved.
      setTraceStatus((prev) =>
        prev
          ? prev.map((l) =>
              l.id === selectedLesson.id
                ? { ...l, hasTrace: true, points: recordedPath.length }
                : l,
            )
          : prev,
      );
    } catch (err) {
      // Never lose a trace: fall back to the clipboard on any network/save error.
      setSaveState("error");
      let copiedOk = false;
      try {
        await navigator.clipboard.writeText(JSON.stringify(recordedPath));
        copiedOk = true;
      } catch {
        // clipboard may be blocked; the JSON textarea below is the last resort
      }
      const base = err instanceof Error ? err.message : "Save failed.";
      setSaveMessage(
        copiedOk
          ? `${base} JSON copied to clipboard as a fallback.`
          : `${base} Copy the JSON below manually.`,
      );
    }
  }, [recordedPath, selectedLesson, authorPassword]);

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
          : "Could not start recording. Check microphone permission.",
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
        err instanceof Error ? err.message : "Recording failed. Try again.",
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
      setAudioError("Playback failed. Try the download link instead.");
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
            {selectedLesson.id}): {recordedPath.length} points
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
          the way a learner should write it. If possible, record on a phone:
          this canvas has the same geometry learners see.
        </p>
      </Card>

      {/* Live status board — truth from GitHub, not the deployed bundle. */}
      <section aria-label="Trace status">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-ui text-lg font-bold text-forest">Letters</h2>
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="min-h-[44px] px-2 font-ui text-sm font-bold text-forest underline underline-offset-4"
          >
            Refresh
          </button>
        </div>
        {statusError && (
          <Card className="mb-2">
            <p className="font-ui text-sm text-serpent-deep">
              Status unavailable: {statusError} You can still trace and use
              Copy JSON.
            </p>
          </Card>
        )}
        {traceStatus === null && !statusError && (
          <p className="font-ui text-sm text-forest-soft">Loading status…</p>
        )}
        {traceStatus && (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {traceStatus.map((l) => {
                const active = l.id === selectedLesson.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleSelectLesson(l.id)}
                    aria-label={`${l.id}, ${l.hasTrace ? `traced, ${l.points} points` : "pending"}`}
                    className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl border-2 p-1 transition-colors ${
                      active ? "border-forest" : "border-sage-200"
                    } ${l.hasTrace ? "bg-sage-100" : "bg-cream-soft"}`}
                  >
                    <span className="font-tamil text-2xl leading-none text-forest">
                      {l.glyph}
                    </span>
                    <span
                      className={`mt-1 font-ui text-[10px] font-bold ${
                        l.hasTrace ? "text-forest" : "text-sage-500"
                      }`}
                    >
                      {l.hasTrace ? "✓ traced" : "pending"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-ui text-xs text-forest-soft">
              <span className="font-bold text-forest">✓ traced</span> has a
              saved path ·{" "}
              <span className="font-bold text-sage-500">pending</span> needs one
            </p>
          </>
        )}
      </section>

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
              {lesson.glyph} · {lesson.id}
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
              : "No stroke recorded yet. Draw on the canvas."}
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

        {/* One-tap save straight to GitHub (server-side, password-gated). */}
        <div className="space-y-2">
          {authorPassword && !changingPassword ? (
            <>
              <Button
                fullWidth
                onClick={() => void handleSaveToGitHub()}
                disabled={!recordedPath || saveState === "saving"}
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Saved ✓"
                    : "Save to GitHub"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setChangingPassword(true);
                  setPasswordInput("");
                }}
                className="min-h-[44px] font-ui text-xs text-forest-soft underline underline-offset-4"
              >
                Change author password
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (passwordInput) persistPassword(passwordInput);
              }}
              className="space-y-2"
            >
              <label
                htmlFor="author-password"
                className="block font-ui text-sm font-bold text-forest"
              >
                Author password (needed to save)
              </label>
              <input
                id="author-password"
                type="password"
                autoComplete="current-password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="min-h-[48px] w-full rounded-blob border-2 border-sage-300 bg-cream-soft px-4 font-ui text-base text-forest"
              />
              <Button
                type="submit"
                fullWidth
                variant="secondary"
                disabled={!passwordInput}
              >
                Save password for this session
              </Button>
            </form>
          )}
          {saveMessage && (
            <p
              className={`font-ui text-sm ${
                saveState === "error" ? "text-serpent-deep" : "text-forest"
              }`}
            >
              {saveMessage}
            </p>
          )}
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
                  &quot;/audio/a.m4a&quot;). Browsers record m4a/webm; either
                  plays fine. Convert to mp3 only if you prefer.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
