import fs from "node:fs";
import path from "node:path";
import { normalizeTracePath } from "./trace";
import type { Lesson } from "./types";

/**
 * Server-side lesson loader. Reads every *.json in /content/lessons/ and
 * sorts by `order`. Adding a letter = dropping in a JSON file (+ image +
 * audio). No code changes required.
 *
 * Only usable from server components / build time (uses node:fs).
 */

const LESSONS_DIR = path.join(process.cwd(), "content", "lessons");

/** Validate the shape loudly at build time so a bad JSON fails fast. */
function parseLesson(raw: unknown, file: string): Lesson {
  const problems: string[] = [];
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  function str(key: string): string {
    const v = obj[key];
    if (typeof v !== "string") {
      problems.push(`"${key}" must be a string`);
      return "";
    }
    return v;
  }
  function num(key: string): number {
    const v = obj[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      problems.push(`"${key}" must be a number`);
      return 0;
    }
    return v;
  }

  const lesson: Lesson = {
    id: str("id"),
    order: num("order"),
    glyph: str("glyph"),
    phonetic: str("phonetic"),
    image: str("image"),
    peculiarities: str("peculiarities"),
    vallalar_note:
      obj.vallalar_note === null || obj.vallalar_note === undefined
        ? null
        : typeof obj.vallalar_note === "string"
          ? obj.vallalar_note
          : (problems.push('"vallalar_note" must be a string or null'), null),
    audio: str("audio"),
    // Accepts the legacy flat form and the new multi-stroke form; both are
    // normalized to NormalizedPoint[][]. A missing/garbage path yields [].
    trace_path: normalizeTracePath(obj.trace_path),
    trace_time_limit: num("trace_time_limit"),
    trace_tolerance: num("trace_tolerance"),
    distractors:
      Array.isArray(obj.distractors) &&
      obj.distractors.every((d): d is string => typeof d === "string")
        ? obj.distractors
        : (problems.push('"distractors" must be an array of strings'), []),
  };

  if (problems.length > 0) {
    throw new Error(`Invalid lesson file ${file}: ${problems.join("; ")}`);
  }
  return lesson;
}

export function getAllLessons(): Lesson[] {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  const files = fs
    .readdirSync(LESSONS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const lessons = files.map((file) => {
    const raw = fs.readFileSync(path.join(LESSONS_DIR, file), "utf-8");
    return parseLesson(JSON.parse(raw), file);
  });
  return lessons.sort((a, b) => a.order - b.order);
}

export function getLessonById(id: string): Lesson | null {
  return getAllLessons().find((lesson) => lesson.id === id) ?? null;
}

/** Lesson ids sorted by order — the unlock chain for the home path. */
export function getOrderedLessonIds(): string[] {
  return getAllLessons().map((lesson) => lesson.id);
}
