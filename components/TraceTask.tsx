"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Lesson } from "@/lib/types";
import {
  TRACE_CANVAS_ASPECT,
  addFingerPointMulti,
  createMultiStrokeSession,
  liftStrokeMulti,
  multiCoveredFraction,
  resamplePath,
  scaleTolerance,
  toPixelPath,
  type MultiStrokeSession,
  type PixelPoint,
  type TraceSession,
} from "@/lib/trace";
import { Button, Card } from "@/components/ui";

/**
 * TraceTask — the learner traces the letter along the snake's path, inside a
 * forgiving corridor, before a gentle timer runs out. Letters may have
 * several strokes: the learner lifts between them and each reference stroke
 * is validated in turn.
 *
 * ALL validation math lives in lib/trace.ts; this component only feeds
 * pointer samples in and draws what the session reports back.
 */

export interface TaskComponentProps {
  lesson: Lesson;
  /** Called on success with seconds from first touch (for the time bonus). */
  onPass: (elapsedSeconds?: number) => void;
  onFail: () => void;
  isRedeeming: boolean;
}

type Phase = "idle" | "tracing" | "success" | "fail";

interface CanvasSize {
  w: number;
  h: number;
}

/** How long the lit-up guide glows before onPass fires. */
const SUCCESS_HOLD_MS = 600;
/** How long the shake/dim plays before onFail fires. */
const FAIL_HOLD_MS = 400;

/* Palette (canvas cannot read Tailwind tokens). */
const CORRIDOR_COLOR = "rgba(168, 197, 160, 0.45)"; // sage-300, translucent
const CENTER_LINE_COLOR = "#6E9663"; // sage-500
const COVERED_COLOR = "#F5A94B"; // serpent
const TRAIL_COLOR = "#E08E2B"; // serpent-deep
const MARKER_COLOR = "#2E5B3E"; // forest
const MARKER_DOT_COLOR = "#F5EFDF"; // cream

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  points: readonly PixelPoint[],
  style: string,
  width: number,
): void {
  if (points.length === 0) return;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + 0.01, points[0].y);
  }
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

/** Draw the covered portion of one stroke's guide in snake orange. */
function drawCoveredGuide(
  ctx: CanvasRenderingContext2D,
  session: TraceSession,
): void {
  const { guidePx, covered } = session;
  ctx.strokeStyle = COVERED_COLOR;
  ctx.fillStyle = COVERED_COLOR;
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let runStart = -1;
  for (let i = 0; i <= covered.length; i++) {
    const isCovered = i < covered.length && covered[i];
    if (isCovered && runStart === -1) runStart = i;
    if (!isCovered && runStart !== -1) {
      const runEnd = i - 1;
      if (runEnd === runStart) {
        ctx.beginPath();
        ctx.arc(guidePx[runStart].x, guidePx[runStart].y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(guidePx[runStart].x, guidePx[runStart].y);
        for (let j = runStart + 1; j <= runEnd; j++) {
          ctx.lineTo(guidePx[j].x, guidePx[j].y);
        }
        ctx.stroke();
      }
      runStart = -1;
    }
  }
}

/** Start dot, "start" label, and an arrowhead showing the initial direction. */
function drawStartMarker(
  ctx: CanvasRenderingContext2D,
  guidePolyline: readonly PixelPoint[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (guidePolyline.length === 0) return;
  const start = guidePolyline[0];

  const dense = resamplePath(guidePolyline);
  const ahead = dense[Math.min(6, dense.length - 1)];
  const dx = ahead.x - start.x;
  const dy = ahead.y - start.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;

  if (len > 0) {
    const tipX = start.x + ux * 34;
    const tipY = start.y + uy * 34;
    const backX = tipX - ux * 12;
    const backY = tipY - uy * 12;
    const px = -uy;
    const py = ux;
    ctx.fillStyle = MARKER_COLOR;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(backX + px * 6, backY + py * 6);
    ctx.lineTo(backX - px * 6, backY - py * 6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = MARKER_COLOR;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MARKER_DOT_COLOR;
  ctx.beginPath();
  ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = MARKER_COLOR;
  ctx.font = "700 12px Nunito, system-ui, sans-serif";
  ctx.textAlign = "center";
  const labelX = Math.min(Math.max(start.x, 20), canvasWidth - 20);
  if (start.y + 30 <= canvasHeight) {
    ctx.textBaseline = "top";
    ctx.fillText("start", labelX, start.y + 16);
  } else {
    ctx.textBaseline = "bottom";
    ctx.fillText("start", labelX, start.y - 16);
  }
}

export default function TraceTask({
  lesson,
  onPass,
  onFail,
  isRedeeming,
}: TaskComponentProps) {
  const strokeCount = lesson.trace_path.length;
  const hasPath = strokeCount > 0;
  const multiStroke = strokeCount > 1;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);

  const sizeRef = useRef<CanvasSize | null>(null);
  const msRef = useRef<MultiStrokeSession | null>(null);
  /** True once the first stroke of this attempt has begun. */
  const startedRef = useRef(false);
  const trailRef = useRef<PixelPoint[]>([]);
  /** Set the instant pass/fail is decided — freezes ALL input and timers. */
  const finishedRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const activePointerRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  /** performance.now() at the first touch; drives the XP time bonus. */
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coveragePctRef = useRef(0);

  const [size, setSize] = useState<CanvasSize | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [coveragePct, setCoveragePct] = useState(0);
  const [strokeIndex, setStrokeIndex] = useState(0);

  const onPassRef = useRef(onPass);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onPassRef.current = onPass;
    onFailRef.current = onFail;
  }, [onPass, onFail]);

  const releaseActivePointer = useCallback(() => {
    const canvas = canvasRef.current;
    const id = activePointerRef.current;
    activePointerRef.current = null;
    if (canvas !== null && id !== null) {
      try {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      } catch {
        // Pointer already gone — nothing to release.
      }
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const cssSize = sizeRef.current;
    if (!canvas || !cssSize) return;
    const { w, h } = cssSize;

    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.max(1, Math.round(w * dpr));
    const pxH = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const strokesPx = lesson.trace_path.map((stroke) =>
      toPixelPath(stroke, w, h),
    );
    if (strokesPx.length === 0) return;

    const corridorWidth = 2 * scaleTolerance(lesson.trace_tolerance, w);
    // 1. Faint corridor for every stroke.
    for (const gp of strokesPx) strokePolyline(ctx, gp, CORRIDOR_COLOR, corridorWidth);
    // 2. Thinner center line so the shape is readable.
    for (const gp of strokesPx) strokePolyline(ctx, gp, CENTER_LINE_COLOR, 6);

    // 3. Progress: covered points in snake orange (whole letter on success).
    if (phaseRef.current === "success") {
      ctx.save();
      ctx.shadowColor = "rgba(245, 169, 75, 0.9)";
      ctx.shadowBlur = 18;
      for (const gp of strokesPx) strokePolyline(ctx, gp, COVERED_COLOR, 10);
      ctx.restore();
    } else if (msRef.current) {
      for (const s of msRef.current.strokes) drawCoveredGuide(ctx, s);
    }

    // 4. The learner's raw finger trail for the current stroke.
    if (phaseRef.current !== "success" && trailRef.current.length > 1) {
      strokePolyline(ctx, trailRef.current, TRAIL_COLOR, 3);
    }

    // 5. Start marker on the CURRENT stroke (hidden on success).
    if (phaseRef.current !== "success") {
      const idx = msRef.current ? msRef.current.current : 0;
      const guide = strokesPx[idx] ?? strokesPx[0];
      drawStartMarker(ctx, guide, w, h);
    }
  }, [lesson.trace_path, lesson.trace_tolerance]);

  const stopTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Decide the outcome exactly once, freeze input, then notify the parent. */
  const finish = useCallback(
    (outcome: "pass" | "fail") => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      stopTimer();
      releaseActivePointer();

      const nextPhase: Phase = outcome === "pass" ? "success" : "fail";
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      if (outcome === "pass") {
        coveragePctRef.current = 100;
        setCoveragePct(100);
      }
      draw();

      const elapsedSeconds =
        startTimeRef.current !== null
          ? (performance.now() - startTimeRef.current) / 1000
          : undefined;
      holdTimeoutRef.current = setTimeout(
        () => {
          if (outcome === "pass") onPassRef.current(elapsedSeconds);
          else onFailRef.current();
        },
        outcome === "pass" ? SUCCESS_HOLD_MS : FAIL_HOLD_MS,
      );
    },
    [draw, releaseActivePointer, stopTimer],
  );

  /** Countdown starts on the FIRST touch only; drains the slim bar. */
  const startTimer = useCallback(() => {
    if (deadlineRef.current !== null) return;
    const totalMs = Math.max(1, lesson.trace_time_limit) * 1000;
    startTimeRef.current = performance.now();
    deadlineRef.current = startTimeRef.current + totalMs;
    const tick = () => {
      rafRef.current = null;
      if (finishedRef.current || deadlineRef.current === null) return;
      const remaining = deadlineRef.current - performance.now();
      const fraction = Math.max(0, Math.min(1, remaining / totalMs));
      if (fillRef.current) {
        fillRef.current.style.width = `${fraction * 100}%`;
      }
      if (remaining <= 0) {
        finish("fail"); // timeout mid-trace
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [finish, lesson.trace_time_limit]);

  /** Store the updated multi-stroke session, then act on what it decided. */
  const applyMulti = useCallback(
    (next: MultiStrokeSession) => {
      msRef.current = next;
      const pct = Math.round(multiCoveredFraction(next) * 100);
      if (pct !== coveragePctRef.current && !finishedRef.current) {
        coveragePctRef.current = pct;
        setCoveragePct(pct);
      }
      if (next.failure !== null) {
        finish("fail");
        return;
      }
      if (next.done) {
        finish("pass"); // last stroke auto-completed without a lift
        return;
      }
      draw();
    },
    [draw, finish],
  );

  const pointFromEvent = (
    e: ReactPointerEvent<HTMLCanvasElement>,
  ): PixelPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (finishedRef.current) return;
    if (!e.isPrimary) return; // multi-touch: ignore non-primary entirely
    if (activePointerRef.current !== null) return;
    const canvas = canvasRef.current;
    const cssSize = sizeRef.current;
    if (!canvas || !cssSize) return;
    if (e.nativeEvent.cancelable) e.preventDefault();

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail if the pointer vanished — tracing still works.
    }
    activePointerRef.current = e.pointerId;

    // First touch of the whole trace: create the session and start the clock.
    if (!startedRef.current || !msRef.current) {
      msRef.current = createMultiStrokeSession(
        lesson.trace_path,
        cssSize.w,
        cssSize.h,
        lesson.trace_tolerance,
      );
      startedRef.current = true;
      coveragePctRef.current = 0;
      setCoveragePct(0);
      setStrokeIndex(0);
      phaseRef.current = "tracing";
      setPhase("tracing");
      startTimer();
    }

    // Begin a (possibly new) stroke: reset the raw finger trail.
    trailRef.current = [];
    const p = pointFromEvent(e);
    if (!p) return;
    trailRef.current.push(p);
    applyMulti(addFingerPointMulti(msRef.current, p.x, p.y));
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (finishedRef.current) return;
    if (activePointerRef.current !== e.pointerId) return;
    const session = msRef.current;
    if (!session) return; // no active session: ignore stray moves
    if (e.nativeEvent.cancelable) e.preventDefault();

    const p = pointFromEvent(e);
    if (!p) return;
    trailRef.current.push(p);
    applyMulti(addFingerPointMulti(session, p.x, p.y));
  };

  const handlePointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    if (e.nativeEvent.cancelable) e.preventDefault();
    releaseActivePointer();
    if (finishedRef.current) return;
    const session = msRef.current;
    if (!session) return;

    const { session: lifted, advanced } = liftStrokeMulti(session);
    msRef.current = lifted;
    if (lifted.failure !== null) {
      finish("fail");
      return;
    }
    if (lifted.done) {
      finish("pass");
      return;
    }
    if (advanced) {
      // Move on to the next reference stroke: clear the trail, show its start.
      trailRef.current = [];
      setStrokeIndex(lifted.current);
      draw();
    }
  };

  // Measure the canvas box; all math runs in CSS pixels.
  useEffect(() => {
    if (!hasPath) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      if (w <= 0) return;
      const prev = sizeRef.current;
      if (prev && Math.abs(prev.w - w) < 0.5) return;
      if (prev && startedRef.current && !finishedRef.current) {
        // A mid-trace resize invalidates pixel space — abandon the attempt.
        msRef.current = null;
        startedRef.current = false;
        trailRef.current = [];
        releaseActivePointer();
        phaseRef.current = "idle";
        setPhase("idle");
        setStrokeIndex(0);
      }
      const next: CanvasSize = { w, h: w / TRACE_CANVAS_ASPECT };
      sizeRef.current = next;
      setSize(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPath, releaseActivePointer]);

  // Redraw whenever size or phase changes (handlers also draw directly).
  useEffect(() => {
    draw();
  }, [draw, size, phase]);

  // Unmount guard rails: kill rAF + timeouts, release pointer capture.
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      finishedRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (holdTimeoutRef.current !== null) clearTimeout(holdTimeoutRef.current);
      const id = activePointerRef.current;
      if (canvas !== null && id !== null) {
        try {
          if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        } catch {
          // Already released.
        }
      }
    };
  }, []);

  /* ---------------- Empty-path case: keep the lesson playable ---------- */

  if (!hasPath) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4">
        <Card className="text-center">
          <p
            className="font-tamil text-6xl font-bold text-forest"
            aria-hidden="true"
          >
            {lesson.glyph}
          </p>
          <p className="mt-4 font-ui text-base text-forest">
            Trace path not yet recorded. Open Author Mode to add one.
          </p>
          {process.env.NODE_ENV === "development" && (
            <Link
              href="/author"
              className="mt-2 inline-flex min-h-[48px] items-center justify-center px-4 font-ui text-base font-bold text-forest underline underline-offset-4"
            >
              Open Author Mode
            </Link>
          )}
        </Card>
        <Button
          variant="primary"
          fullWidth
          onClick={() => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            onPass();
          }}
        >
          Continue
        </Button>
      </div>
    );
  }

  /* ---------------- Canvas screen -------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="mb-3 text-center">
        {isRedeeming && (
          <p className="mx-auto mb-2 inline-block rounded-full bg-wisdom-soft px-3 py-1 font-ui text-xs font-bold text-wisdom-deep">
            Redemption round: steady does it
          </p>
        )}
        <h2 className="font-ui text-2xl font-bold text-forest">
          Trace <span className="font-tamil">{lesson.glyph}</span>
        </h2>
        <p className="mt-1 font-ui text-sm text-forest-soft">
          {multiStroke
            ? "Start at the dot and follow each stroke. Lift your finger between strokes."
            : "Start at the dot and follow the snake's path in one stroke."}
        </p>
        {multiStroke && (
          <p className="mt-1 font-ui text-sm font-bold text-forest">
            Stroke {Math.min(strokeIndex + 1, strokeCount)} of {strokeCount}
          </p>
        )}
      </div>

      <div
        className={`overflow-hidden rounded-blob border-2 border-sage-200 bg-cream-soft shadow-leaf transition-opacity duration-300 ${
          phase === "fail" ? "animate-wiggle opacity-60" : ""
        }`}
      >
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ aspectRatio: `${TRACE_CANVAS_ASPECT}` }}
        >
          <canvas
            ref={canvasRef}
            className="touch-none-strict absolute inset-0 h-full w-full"
            aria-label={`Tracing canvas for ${lesson.glyph}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onContextMenu={(e) => e.preventDefault()}
          />
          {phase === "success" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-serpent text-5xl font-bold text-forest-deep shadow-leaf">
                ✓
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slim countdown: sage track, serpent fill, snake riding the end. */}
      <div className="mt-4 px-2" aria-hidden="true">
        <div className="relative h-2.5 w-full rounded-full bg-sage-200">
          <div
            ref={fillRef}
            className="relative h-full rounded-full bg-serpent"
            style={{ width: "100%" }}
          >
            <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 text-base leading-none">
              🐍
            </span>
          </div>
        </div>
      </div>

      <p className="mt-2 min-h-[1.25rem] text-center font-ui text-sm text-forest-soft">
        {phase === "tracing"
          ? `${coveragePct}% traced`
          : phase === "success"
            ? "Beautiful!"
            : " "}
      </p>
    </div>
  );
}
