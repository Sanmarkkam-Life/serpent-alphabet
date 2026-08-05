#!/usr/bin/env node
// @ts-check
/**
 * Batch-generate Tamil letter pronunciations via the ElevenLabs
 * text-to-speech API and upload the resulting mp3s straight into the
 * Google Drive audio folder. The existing Drive -> GitHub sync pipeline
 * then mirrors them into public/audio automatically.
 *
 * Usage:
 *   node scripts/generate-audio.mjs                         # list voices, then exit
 *   node scripts/generate-audio.mjs --voice-id=ID           # generate all, upload to Drive
 *   node scripts/generate-audio.mjs --voice-id=ID --only=அ,ஆ
 *   node scripts/generate-audio.mjs --voice-id=ID --local-only   # write ./temp-audio, no upload
 *   node scripts/generate-audio.mjs --voice-id=ID --force        # regenerate even if in Drive
 *   node scripts/generate-audio.mjs --voice-id=ID --model=ID     # override the default TTS model
 *
 * Secrets (env only, never written to disk):
 *   ELEVENLABS_API_KEY, GOOGLE_SERVICE_ACCOUNT_KEY
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { google } from "googleapis";

/* ---- Known facts ----------------------------------------------------- */

// Shared Drive: every Drive call passes supportsAllDrives (and list also
// includeItemsFromAllDrives), or list silently returns [] on Shared Drives.
const AUDIO_FOLDER_ID = "1B1scaNVXq7TSQ1UVCXGAhip6V0qrjmZ2";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Built-in fallbacks, used only when the pronunciation map has no `defaults`
// block (older map format). The map's `defaults` — and per-letter overrides —
// take precedence when present. See resolveDefaults() / letter resolution.
//
// If your ElevenLabs account has a newer, higher-quality model, set it in the
// map's defaults.model_id or pass --model=<id>; check the ElevenLabs docs for
// the current best model for short multilingual utterances. Do not hard-assume
// any model beyond this documented default.
const TTS_MODEL_ID = "eleven_multilingual_v2";
const VOICE_SETTINGS = {
  stability: 0.75,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

/** Delay between ElevenLabs calls to stay under rate limits. */
const RATE_LIMIT_MS = 1000;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const MAP_PATH = path.join(SCRIPT_DIR, "pronunciation-map.json");
const LOCAL_OUT_DIR = path.join(REPO_ROOT, "temp-audio");

/* ---- CLI parsing ----------------------------------------------------- */

/** @returns {{ voiceId: string | null, only: string[] | null, localOnly: boolean, force: boolean, model: string | null }} */
function parseArgs(argv) {
  const args = {
    voiceId: /** @type {string | null} */ (null),
    only: /** @type {string[] | null} */ (null),
    localOnly: false,
    force: false,
    model: /** @type {string | null} */ (null),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--local-only") args.localOnly = true;
    else if (a === "--force") args.force = true;
    else if (a.startsWith("--voice-id=")) args.voiceId = a.slice(11);
    else if (a === "--voice-id") args.voiceId = argv[++i] ?? null;
    else if (a.startsWith("--only=")) args.only = splitGlyphs(a.slice(7));
    else if (a === "--only") args.only = splitGlyphs(argv[++i] ?? "");
    else if (a.startsWith("--model=")) args.model = a.slice(8);
    else if (a === "--model") args.model = argv[++i] ?? null;
  }
  return args;
}

/** Split a comma-separated glyph list into NFC-normalized glyphs. */
function splitGlyphs(value) {
  return value
    .split(",")
    .map((g) => g.trim().normalize("NFC"))
    .filter((g) => g.length > 0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---- ElevenLabs ------------------------------------------------------ */

function requireElevenLabsKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it as a GitHub secret (or export " +
        "it locally) before running.",
    );
  }
  return key;
}

/** Best-effort language string from whatever fields a voice exposes. */
function voiceLanguage(v) {
  if (Array.isArray(v.verified_languages) && v.verified_languages.length > 0) {
    return v.verified_languages
      .map((x) => x?.language ?? x?.locale ?? "")
      .filter(Boolean)
      .join("/");
  }
  return v.labels?.language ?? v.fine_tuning?.language ?? "";
}

/** Compact "key: value" summary of a voice's labels, if any. */
function voiceLabelSummary(v) {
  const labels = v.labels;
  if (!labels || typeof labels !== "object") return "";
  return Object.entries(labels)
    .filter(([, val]) => typeof val === "string" && val.trim() !== "")
    .map(([key, val]) => `${key}: ${val}`)
    .join(", ");
}

/** List voices with the language/labels/description that help pick a Tamil voice. */
async function listVoices(apiKey) {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs /voices failed: ${res.status} ${res.statusText} ${body}`.trim(),
    );
  }
  const data = await res.json();
  const voices = Array.isArray(data.voices) ? data.voices : [];
  console.log(
    `\nAvailable ElevenLabs voices (showing up to 20 of ${voices.length}):\n`,
  );
  for (const v of voices.slice(0, 20)) {
    const name = String(v.name ?? "(unnamed)");
    console.log(`  ${name}`);
    console.log(`    voice_id: ${String(v.voice_id ?? "")}`);
    const language = voiceLanguage(v);
    if (language) console.log(`    language: ${language}`);
    const labels = voiceLabelSummary(v);
    if (labels) console.log(`    labels:   ${labels}`);
    const description = v.description ?? v.labels?.description ?? "";
    if (description) {
      console.log(`    about:    ${String(description).slice(0, 100)}`);
    }
    console.log("");
  }
  console.log(
    "For Tamil vowels, choose a multilingual/Tamil voice; English-only " +
      "voices mispronounce isolated letters.",
  );
  console.log(
    "If none above suit Tamil, add a multilingual or Tamil-native voice from " +
      "the ElevenLabs Voice Library to your account, then re-run.",
  );
  console.log(
    "\nNo --voice-id specified. Pick one from above and run again with " +
      "--voice-id=<id>\n",
  );
}

/**
 * Synthesize one letter to an mp3 Buffer, using the resolved model and voice
 * settings for that letter.
 * @returns {Promise<Buffer>}
 */
async function synthesize(apiKey, voiceId, text, modelId, voiceSettings) {
  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: voiceSettings,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(
      `ElevenLabs TTS failed: ${res.status} ${res.statusText} ${body}`.trim(),
    );
    // @ts-expect-error attach status for the caller's fatal-vs-continue check
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

/* ---- Google Drive ---------------------------------------------------- */

function createDriveClient() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawKey || rawKey.trim() === "") {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not set. Add the service-account JSON " +
        "as a GitHub secret of that name.",
    );
  }
  let creds;
  try {
    creds = JSON.parse(rawKey);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    // Full drive scope: we both LIST existing files (created by others) and
    // UPLOAD new ones. drive.readonly cannot upload; drive.file cannot see
    // files the service account did not create.
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });
  return { drive, clientEmail: creds.client_email ?? "(unknown)" };
}

/** Set of existing filenames (NFC) in the audio folder. */
async function listExistingNames(drive) {
  const names = new Set();
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${AUDIO_FOLDER_ID}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.name) names.add(f.name.normalize("NFC"));
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return names;
}

/** True when a Drive error is a permissions failure (needs Contributor). */
function isPermissionError(err) {
  const status =
    err?.code ?? err?.status ?? err?.response?.status ?? undefined;
  if (status === 403) return true;
  const message = String(err?.message ?? "");
  return /insufficient|permission|forbidden/i.test(message);
}

function printPermissionDiagnostic(clientEmail) {
  console.error(
    "\n=========================================================\n" +
      "UPLOAD FAILED - insufficient permissions.\n" +
      "The service account needs Contributor or Content Manager\n" +
      "access on the Shared Drive (not just Viewer).\n" +
      "Fix: Drive -> Shared Drive -> Manage members ->\n" +
      `change ${clientEmail} from Viewer to\n` +
      "Contributor. Then re-run.\n" +
      "=========================================================\n",
  );
}

async function uploadMp3(drive, glyph, buffer) {
  await drive.files.create({
    requestBody: {
      name: `${glyph}.mp3`,
      parents: [AUDIO_FOLDER_ID],
    },
    media: {
      mimeType: "audio/mpeg",
      body: Readable.from(buffer),
    },
    supportsAllDrives: true,
    fields: "id, name",
  });
}

/* ---- Config resolution ----------------------------------------------- */

/**
 * Resolve the top-level model + voice settings. Precedence for the model:
 * --model flag > map `defaults.model_id` > built-in default. Voice settings
 * from the map's defaults merge over (and so override) the built-in fallback.
 * When the map has no `defaults` block (older format), the built-ins apply.
 * @returns {{ model_id: string, voice_settings: Record<string, unknown> }}
 */
function resolveDefaults(map, cliModel) {
  const d = map.defaults ?? {};
  return {
    model_id: cliModel ?? d.model_id ?? TTS_MODEL_ID,
    voice_settings: { ...VOICE_SETTINGS, ...(d.voice_settings ?? {}) },
  };
}

/**
 * The exact text sent to TTS for a letter: an explicit `pronunciationText`
 * override if present, else the glyph (`tamilText`). The legacy `usePhonetic`
 * flag is still honoured as a fallback for entries that set it.
 */
function textForLetter(letter) {
  if (typeof letter.pronunciationText === "string" && letter.pronunciationText !== "") {
    return letter.pronunciationText;
  }
  return letter.usePhonetic ? letter.phoneticHint : letter.tamilText;
}

/* ---- Main ------------------------------------------------------------ */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = requireElevenLabsKey();

  const mapRaw = await fs.readFile(MAP_PATH, "utf-8");
  /** @type {{ defaults?: { model_id?: string, voice_settings?: Record<string, unknown> }, letters: Array<{glyph: string, id: string, tamilText: string, phoneticHint: string, notes?: string, usePhonetic?: boolean, pronunciationText?: string, model_id?: string, voice_settings?: Record<string, unknown>}> }} */
  const map = JSON.parse(mapRaw);
  let letters = map.letters ?? [];
  const defaults = resolveDefaults(map, args.model);

  // No voice chosen yet: list voices so the author can pick one, then stop.
  if (!args.voiceId) {
    await listVoices(apiKey);
    return;
  }

  // Optional --only filter, matched on the (NFC) glyph.
  if (args.only) {
    const wanted = new Set(args.only);
    letters = letters.filter((l) => wanted.has(l.glyph.normalize("NFC")));
    const missing = [...wanted].filter(
      (g) => !letters.some((l) => l.glyph.normalize("NFC") === g),
    );
    for (const g of missing) {
      console.warn(`--only: "${g}" is not in the pronunciation map, ignoring.`);
    }
  }
  if (letters.length === 0) {
    console.log("No letters to generate (empty map or --only matched nothing).");
    return;
  }

  // Drive is only needed when actually uploading.
  let drive = null;
  let clientEmail = "(unknown)";
  let existing = new Set();
  if (!args.localOnly) {
    const client = createDriveClient();
    drive = client.drive;
    clientEmail = client.clientEmail;
    try {
      existing = await listExistingNames(drive);
    } catch (err) {
      if (isPermissionError(err)) {
        printPermissionDiagnostic(clientEmail);
        process.exit(1);
      }
      throw err;
    }
  } else {
    await fs.mkdir(LOCAL_OUT_DIR, { recursive: true });
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  /** Glyphs actually (re)generated this run, for the summary. */
  const regenerated = [];

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const glyph = letter.glyph.normalize("NFC");
    const fileName = `${glyph}.mp3`;

    if (!args.localOnly && !args.force && existing.has(fileName)) {
      skipped++;
      console.log(`skip (already in Drive): ${fileName}`);
      continue;
    }

    // Per-letter overrides merge over the resolved defaults.
    const text = textForLetter(letter);
    const modelId = letter.model_id ?? defaults.model_id;
    const voiceSettings = {
      ...defaults.voice_settings,
      ...(letter.voice_settings ?? {}),
    };

    let buffer;
    try {
      buffer = await synthesize(apiKey, args.voiceId, text, modelId, voiceSettings);
    } catch (err) {
      // A 401 means the ElevenLabs key is bad; every call will fail, so stop.
      // @ts-expect-error status attached in synthesize
      if (err?.status === 401) {
        console.error(`\nElevenLabs auth failed (401): ${err.message}`);
        process.exit(1);
      }
      failed++;
      console.warn(`FAILED ${fileName}: ${err instanceof Error ? err.message : err}`);
      if (i < letters.length - 1) await sleep(RATE_LIMIT_MS);
      continue;
    }

    try {
      if (args.localOnly) {
        const out = path.join(LOCAL_OUT_DIR, fileName);
        await fs.writeFile(out, buffer);
        console.log(`wrote ${path.relative(REPO_ROOT, out)} (${buffer.length} bytes)`);
      } else {
        await uploadMp3(drive, glyph, buffer);
        console.log(`uploaded to Drive: ${fileName} (${buffer.length} bytes)`);
      }
      generated++;
      regenerated.push(glyph);
    } catch (err) {
      if (isPermissionError(err)) {
        printPermissionDiagnostic(clientEmail);
        // Don't keep generating audio that cannot be uploaded.
        process.exit(1);
      }
      failed++;
      console.warn(`UPLOAD FAILED ${fileName}: ${err instanceof Error ? err.message : err}`);
    }

    // Rate limit between ElevenLabs calls (skip after the last one).
    if (i < letters.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(
    `\nGenerated ${generated}, skipped ${skipped} (already exist), failed ${failed}`,
  );
  if (regenerated.length > 0) {
    console.log(`Regenerated: ${regenerated.join(" ")}`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nAudio generation failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
