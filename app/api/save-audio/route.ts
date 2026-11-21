import { NextResponse } from "next/server";
import { getFile, GithubError, putBase64File, putFile } from "@/lib/github";
import { sanitizeLessonId } from "@/lib/traceValidation";
import { safeEqual } from "../_auth";
import { resolveGithubConfig } from "../_github-config";

/**
 * POST /api/save-audio
 * Body: { id, password, mimeType, data }  (data = base64 of the recording)
 * Commits the clip to public/audio/<id>.<ext> and points the lesson's
 * "audio" field at it (with a ?v= stamp so phones don't play a cached copy).
 */

export const dynamic = "force-dynamic";

const LESSONS_DIR = "content/lessons";
const AUDIO_DIR = "public/audio";
/** A letter is a second or two; 2 MB leaves lots of room. */
const MAX_BYTES = 2 * 1024 * 1024;

const EXT_FOR_MIME: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const config = resolveGithubConfig();
  if (!config) return json({ error: "Server is missing GITHUB_TOKEN." }, 500);
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
  const { id, password, mimeType, data } = (body ?? {}) as {
    id?: unknown;
    password?: unknown;
    mimeType?: unknown;
    data?: unknown;
  };

  if (typeof password !== "string" || !safeEqual(password, authorPassword)) {
    return json({ error: "Wrong author password." }, 401);
  }
  const safeId = sanitizeLessonId(id);
  if (!safeId) return json({ error: "Invalid lesson id." }, 400);

  const baseMime =
    typeof mimeType === "string" ? mimeType.split(";")[0].trim() : "";
  const ext = EXT_FOR_MIME[baseMime];
  if (!ext) return json({ error: "Unsupported audio format." }, 400);
  if (typeof data !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(data)) {
    return json({ error: "Audio data is missing or invalid." }, 400);
  }
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes < 1000) return json({ error: "Recording is too short." }, 400);
  if (bytes > MAX_BYTES) return json({ error: "Recording is too long." }, 400);

  const lessonPath = `${LESSONS_DIR}/${safeId}.json`;
  const audioPath = `${AUDIO_DIR}/${safeId}.${ext}`;

  try {
    // 1. The lesson must exist.
    let lessonFile;
    try {
      lessonFile = await getFile(config, lessonPath);
    } catch (err) {
      if (err instanceof GithubError && err.status === 404) {
        return json({ error: `Lesson "${safeId}" does not exist.` }, 404);
      }
      throw err;
    }
    const lesson = JSON.parse(lessonFile.text) as Record<string, unknown>;
    const glyph = typeof lesson.glyph === "string" ? lesson.glyph : safeId;

    // 2. Write the clip (replace if an earlier take exists).
    let audioSha: string | null = null;
    try {
      audioSha = (await getFile(config, audioPath)).sha;
    } catch (err) {
      if (!(err instanceof GithubError && err.status === 404)) throw err;
    }
    await putBase64File(
      config,
      audioPath,
      data,
      audioSha,
      `chore(author): recorded audio for ${glyph}`,
    );

    // 3. Point the lesson at it. Re-read in case the sha moved.
    const fresh = await getFile(config, lessonPath);
    const freshLesson = JSON.parse(fresh.text) as Record<string, unknown>;
    const url = `/audio/${safeId}.${ext}?v=${Date.now().toString(36)}`;
    freshLesson.audio = url;
    const { commitSha } = await putFile(
      config,
      lessonPath,
      JSON.stringify(freshLesson, null, 2) + "\n",
      fresh.sha,
      `chore(author): use recorded audio for ${glyph}`,
    );
    return json({ ok: true, audio: url, commit: commitSha }, 200);
  } catch (err) {
    const status = err instanceof GithubError ? err.status : 500;
    return json({ error: "Could not save the audio. Try again." }, status);
  }
}
