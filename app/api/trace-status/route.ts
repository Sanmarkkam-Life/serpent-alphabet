import { NextResponse } from "next/server";
import { getFile, GithubError, listDirectory } from "@/lib/github";
import { countStrokePoints, normalizeTracePath } from "@/lib/trace";
import { resolveGithubConfig } from "../_github-config";

/**
 * GET /api/trace-status
 * Reads every lesson JSON from GitHub (the source of truth, not the possibly
 * stale deployed bundle) and reports which letters have a trace path.
 * Read-only and non-sensitive, so no author password is required. The token
 * stays server-side and is never included in the response.
 */

export const dynamic = "force-dynamic";

interface LessonStatus {
  id: string;
  glyph: string;
  order: number;
  hasTrace: boolean;
  points: number;
}

const LESSONS_DIR = "content/lessons";
/** Cap concurrent file fetches so we don't hammer the API. */
const CONCURRENCY = 6;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

export async function GET() {
  const config = resolveGithubConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Server is missing GITHUB_TOKEN; trace status unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const entries = await listDirectory(config, LESSONS_DIR);
    const jsonFiles = entries.filter(
      (e) => e.type === "file" && e.name.endsWith(".json"),
    );

    const statuses = await mapWithConcurrency(
      jsonFiles,
      CONCURRENCY,
      async (entry): Promise<LessonStatus | null> => {
        try {
          const file = await getFile(config, `${LESSONS_DIR}/${entry.name}`);
          const data = JSON.parse(file.text) as {
            id?: unknown;
            glyph?: unknown;
            order?: unknown;
            trace_path?: unknown;
          };
          // Count points across strokes so both the legacy flat form and the
          // multi-stroke form report a real point total (not stroke count).
          const points = countStrokePoints(normalizeTracePath(data.trace_path));
          return {
            id: typeof data.id === "string" ? data.id : entry.name.replace(/\.json$/, ""),
            glyph: typeof data.glyph === "string" ? data.glyph : "?",
            order: typeof data.order === "number" ? data.order : 9999,
            hasTrace: points > 0,
            points,
          };
        } catch {
          // A single unparseable file shouldn't sink the whole board.
          return null;
        }
      },
    );

    const lessons = statuses
      .filter((s): s is LessonStatus => s !== null)
      .sort((a, b) => a.order - b.order);

    return NextResponse.json(
      { lessons },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const status = err instanceof GithubError ? err.status : 500;
    const message =
      err instanceof Error ? err.message : "Failed to read trace status.";
    return NextResponse.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
