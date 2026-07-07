import { NextResponse } from "next/server";
import { getFile, GithubError, putFile } from "@/lib/github";
import { sanitizeLessonId, validateTracePath } from "@/lib/traceValidation";
import { resolveGithubConfig } from "../_github-config";

/**
 * POST /api/save-trace
 * Body: { id, trace_path, password }
 * Writes a lesson's trace_path back to the repo (server-side, with the token
 * that never reaches the browser), gated by the author password.
 */

export const dynamic = "force-dynamic";

const LESSONS_DIR = "content/lessons";

/** Length-guarded constant-time-ish string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const config = resolveGithubConfig();
  if (!config) {
    return json({ error: "Server is missing GITHUB_TOKEN." }, 500);
  }
  const authorPassword = process.env.AUTHOR_PASSWORD;
  if (!authorPassword || authorPassword.trim() === "") {
    return json({ error: "Server is missing AUTHOR_PASSWORD." }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }
  const { id, trace_path, password } = (body ?? {}) as {
    id?: unknown;
    trace_path?: unknown;
    password?: unknown;
  };

  // 1. Password gate.
  if (typeof password !== "string" || !safeEqual(password, authorPassword)) {
    return json({ error: "Wrong author password." }, 401);
  }

  // 2. Sanitize id (blocks path traversal).
  const safeId = sanitizeLessonId(id);
  if (!safeId) {
    return json({ error: "Invalid lesson id." }, 400);
  }

  // 3. Validate the trace path shape.
  const validation = validateTracePath(trace_path);
  if (!validation.ok) {
    return json({ error: validation.reason }, 400);
  }
  const filePath = `${LESSONS_DIR}/${safeId}.json`;

  // 4-7. Read current file, set only trace_path, write back. Retry once on a
  // 409 (sha changed underneath us between the read and the write).
  for (let attempt = 1; attempt <= 2; attempt++) {
    let current;
    try {
      current = await getFile(config, filePath);
    } catch (err) {
      if (err instanceof GithubError && err.status === 404) {
        return json({ error: `Lesson "${safeId}" does not exist.` }, 404);
      }
      const status = err instanceof GithubError ? err.status : 500;
      return json({ error: "Could not read the lesson file." }, status);
    }

    let lesson: Record<string, unknown>;
    try {
      lesson = JSON.parse(current.text) as Record<string, unknown>;
    } catch {
      return json({ error: "Lesson file is not valid JSON." }, 500);
    }

    // Only trace_path changes; every other field is preserved verbatim.
    lesson.trace_path = validation.path;
    const glyph = typeof lesson.glyph === "string" ? lesson.glyph : safeId;
    // 2-space indent + trailing newline matches the repo's existing style.
    const serialized = JSON.stringify(lesson, null, 2) + "\n";

    try {
      const { commitSha } = await putFile(
        config,
        filePath,
        serialized,
        current.sha,
        `chore(author): trace path for ${glyph}`,
      );
      return json(
        { ok: true, commit: commitSha, points: validation.path.length },
        200,
      );
    } catch (err) {
      if (err instanceof GithubError && err.status === 409 && attempt === 1) {
        continue; // sha moved; re-read and retry once
      }
      if (err instanceof GithubError && err.status === 409) {
        return json(
          { error: "The lesson changed while saving. Try again." },
          409,
        );
      }
      const status = err instanceof GithubError ? err.status : 500;
      return json({ error: "Could not write the lesson file." }, status);
    }
  }

  return json({ error: "Save failed after a retry." }, 500);
}
