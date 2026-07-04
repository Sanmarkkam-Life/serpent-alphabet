"use client";

/**
 * MediaRecorder helpers with cross-browser fallbacks.
 *
 * iOS Safari records audio/mp4 (AAC); Chrome/Android record audio/webm
 * (Opus). We pick the first supported type and carry the actual mime type
 * with the blob so playback and downloads use the right container.
 */

export interface RecordingHandle {
  stop: () => Promise<RecordedAudio>;
  /** Cancels without producing a recording and releases the mic. */
  cancel: () => void;
}

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  url: string;
}

const CANDIDATE_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
];

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== "undefined"
  );
}

export function pickMimeType(): string {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  for (const type of CANDIDATE_TYPES) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return ""; // let the browser choose its default
}

/** File extension matching a recorded mime type, for downloads. */
export function extensionForMime(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "audio";
}

/**
 * Start recording from the microphone. Throws if permission is denied or
 * recording is unsupported — callers must catch and show the fallback flow.
 */
export async function startRecording(): Promise<RecordingHandle> {
  if (!isRecordingSupported()) {
    throw new Error("Recording is not supported in this browser");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  const releaseMic = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    stop: () =>
      new Promise<RecordedAudio>((resolve, reject) => {
        recorder.onstop = () => {
          releaseMic();
          const actualType = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunks, { type: actualType });
          if (blob.size === 0) {
            reject(new Error("Nothing was recorded"));
            return;
          }
          resolve({ blob, mimeType: actualType, url: URL.createObjectURL(blob) });
        };
        recorder.onerror = () => {
          releaseMic();
          reject(new Error("Recording failed"));
        };
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } finally {
        releaseMic();
      }
    },
  };
}

/**
 * Check whether an audio file exists without crashing on 404 — used for the
 * missing-reference-audio fallback. Some static hosts return 200 + HTML for
 * missing files, so verify the content type looks like audio.
 */
export async function audioFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return false;
    const type = response.headers.get("content-type") ?? "";
    return !type.includes("text/html");
  } catch {
    return false;
  }
}
