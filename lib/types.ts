/**
 * Shared types for the Serpent Alphabet lesson engine.
 * A lesson is fully described by one JSON file in /content/lessons/.
 */

/** A single point in normalized coordinates (0–1 relative to canvas size). */
export type NormalizedPoint = [number, number];

export interface Lesson {
  /** Stable id — matches the JSON filename, e.g. "a" for a.json. */
  id: string;
  /** 1-based position on the learning path; lessons are sorted by this. */
  order: number;
  /** The Tamil letter itself, e.g. "அ". */
  glyph: string;
  /** Friendly pronunciation cue, e.g. "Ah!". */
  phonetic: string;
  /** Path to the wide (~16:9) snake illustration, e.g. "/letters/a.png". */
  image: string;
  /** Teaching text; supports \n\n paragraph breaks. */
  peculiarities: string;
  /** Optional wisdom-card text; render only when present. */
  vallalar_note: string | null;
  /** Path to reference pronunciation audio; the file may be missing. */
  audio: string;
  /** Author-recorded guide path in normalized 0–1 coordinates. */
  trace_path: NormalizedPoint[];
  /** Seconds allowed to finish the trace. */
  trace_time_limit: number;
  /** Corridor half-width in px at the 390px reference canvas width. */
  trace_tolerance: number;
  /** Exactly the wrong-answer glyphs for the Recognize task. */
  distractors: string[];
}

export type TaskType = "learn" | "pronounce" | "trace" | "recognize";

/** One entry in the mastery queue. Recognize appears three times. */
export interface MasteryTask {
  /** Unique within the lesson, e.g. "recognize-2". */
  key: string;
  type: TaskType;
  /**
   * Consecutive passes still required to clear this task.
   * 1 for a task that has never failed; reset to 2 whenever it fails.
   */
  passesNeeded: number;
}
