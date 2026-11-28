import type { Lesson } from "./types";
import type { NormalizedPoint } from "./types";

/** Shape a compound letter as a Lesson, so the trace tools can use it. Client-safe. */
export function compoundAsLesson(
  c: { id: string; glyph: string; translit: string; audio: string | null; trace: NormalizedPoint[][] },
  order: number,
): Lesson {
  return {
    id: c.id,
    order,
    glyph: c.glyph,
    phonetic: c.translit,
    image: "",
    peculiarities: "",
    vallalar_note: null,
    vallalar_source: null,
    audio: c.audio ?? "",
    trace_path: c.trace,
    trace_time_limit: 12,
    trace_tolerance: 40,
    distractors: [],
    snake_name: null,
    snake_name_meaning: null,
  };
}
