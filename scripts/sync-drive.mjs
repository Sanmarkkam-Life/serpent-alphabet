#!/usr/bin/env node
// @ts-check
/**
 * One-way content sync: Google Drive -> repo.
 *
 * Mirrors letter images and pronunciation audio from a Google Drive folder
 * into public/letters and public/audio, so the authoring workflow is simply
 * "drop a file in Drive -> this runs -> Vercel redeploys".
 *
 * Guardrails:
 * - One-way only. This never writes to Drive.
 * - Additive only. Repo files absent from Drive are left alone (content may
 *   also be added to the repo by hand).
 * - Unicode NFC everywhere a name is compared or written (macOS authors in
 *   NFD; the Linux runner needs NFC or names mismatch).
 * - Every Drive API call sets the Shared-Drive flags unconditionally.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

/* ---- Known facts (do not rediscover) -------------------------------- */

// The TamiLearn root's parent begins with "0A", i.e. this lives in a Shared
// Drive. Every call below therefore passes supportsAllDrives +
// includeItemsFromAllDrives; omitting them is what makes files.list return
// an empty array on Shared Drives.
const IMAGES_FOLDER_ID = "1pexfAo_CPMLd_IApU7iIo4ePP1gBfqPc";
const AUDIO_FOLDER_ID = "1B1scaNVXq7TSQ1UVCXGAhip6V0qrjmZ2";

/* ---- Paths ----------------------------------------------------------- */

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const LETTERS_DIR = path.join(REPO_ROOT, "public", "letters");
const AUDIO_DIR = path.join(REPO_ROOT, "public", "audio");
const MANIFEST_PATH = path.join(SCRIPT_DIR, ".drive-manifest.json");

/* ---- Filename rules -------------------------------------------------- */

const ALLOWED_EXTENSIONS = new Set(["png", "webm", "mp3", "mp4"]);
const IMAGE_EXTENSIONS = new Set(["png"]);
// Base name must be Tamil Unicode block only: no ASCII, spaces, arrows,
// parentheses, or digits. Rejects "List.jpeg", "ஊ → Uuh!.png", etc.
const TAMIL_BASE = /^[஀-௿]+$/;

/* ---- Drive client ---------------------------------------------------- */

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
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Paste the full " +
        "service-account key file contents as the secret value.",
    );
  }
  // No temp files: credentials are passed in-memory.
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const drive = google.drive({ version: "v3", auth });
  return { drive, clientEmail: creds.client_email ?? "(unknown)" };
}

/* ---- Listing --------------------------------------------------------- */

/**
 * List every file in a folder, following pageToken to the end. The
 * Shared-Drive flags are set on every page request.
 * @returns {Promise<Array<{id: string, name: string, mimeType: string, md5Checksum?: string, size?: string}>>}
 */
async function listFolder(drive, folderId) {
  /** @type {Array<{id: string, name: string, mimeType: string, md5Checksum?: string, size?: string}>} */
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, md5Checksum, size)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const file of res.data.files ?? []) {
      if (file.id && file.name) {
        files.push({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType ?? "",
          md5Checksum: file.md5Checksum ?? undefined,
          size: file.size ?? undefined,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

/* ---- Filtering ------------------------------------------------------- */

/**
 * Normalize (NFC) and validate a Drive filename.
 * Exported for unit testing.
 * @returns {{ accepted: true, name: string, ext: string } | { accepted: false, reason: string }}
 */
export function classifyName(rawName) {
  const name = rawName.normalize("NFC");
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return { accepted: false, reason: "no file extension" };
  }
  const base = name.slice(0, dot);
  const ext = name.slice(dot + 1).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { accepted: false, reason: `extension .${ext} not allowed` };
  }
  if (!TAMIL_BASE.test(base)) {
    return { accepted: false, reason: "base name is not Tamil-only" };
  }
  return { accepted: true, name, ext };
}

/* ---- Manifest -------------------------------------------------------- */

/**
 * @typedef {{ name: string, md5: string, target: string, syncedAt: string }} ManifestEntry
 * @typedef {{ lastSync: string | null, files: Record<string, ManifestEntry> }} Manifest
 */

/** @returns {Promise<Manifest>} */
async function loadManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.files) {
      return { lastSync: parsed.lastSync ?? null, files: parsed.files };
    }
  } catch {
    // Missing or corrupt manifest: start fresh (everything re-downloads).
  }
  return { lastSync: null, files: {} };
}

/** @param {Manifest} manifest */
async function saveManifest(manifest) {
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}

/* ---- Download -------------------------------------------------------- */

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Download one Drive file to disk as binary. Retries once after a short
 * delay. Returns true on success, false after the second failure.
 */
async function downloadFile(drive, fileId, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
      );
      await fs.writeFile(targetPath, Buffer.from(res.data));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        console.warn(
          `  download failed (attempt 1), retrying: ${message}`,
        );
        await sleep(1500);
      } else {
        console.warn(
          `  WARNING: giving up on ${path.basename(targetPath)}: ${message}`,
        );
        return false;
      }
    }
  }
  return false;
}

/* ---- Main ------------------------------------------------------------ */

async function main() {
  const { drive, clientEmail } = createDriveClient();

  const folders = [
    { id: IMAGES_FOLDER_ID, dir: LETTERS_DIR, label: "images" },
    { id: AUDIO_FOLDER_ID, dir: AUDIO_DIR, label: "audio" },
  ];

  // List both folders. Track per-folder errors: abort only if BOTH fail.
  /** @type {Array<{ folder: typeof folders[number], files: Awaited<ReturnType<typeof listFolder>> }>} */
  const listed = [];
  const rawCounts = { images: 0, audio: 0 };
  let erroredFolders = 0;
  for (const folder of folders) {
    try {
      const files = await listFolder(drive, folder.id);
      rawCounts[folder.label] = files.length;
      listed.push({ folder, files });
      console.log(`Listed ${files.length} raw file(s) in ${folder.label}.`);
    } catch (err) {
      erroredFolders++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`ERROR listing ${folder.label} folder: ${message}`);
    }
  }
  if (erroredFolders === folders.length) {
    throw new Error("Both Drive folders failed to list. Aborting.");
  }

  const manifest = await loadManifest();
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let acceptedCount = 0;

  // Routing is by extension (png -> letters, audio -> audio), so the source
  // folder is not needed here; both folders' files are processed uniformly.
  for (const { files } of listed) {
    for (const file of files) {
      const verdict = classifyName(file.name);
      if (!verdict.accepted) {
        skippedCount++;
        console.log(`skipped (${file.name}): ${verdict.reason}`);
        continue;
      }
      acceptedCount++;
      const targetDir = IMAGE_EXTENSIONS.has(verdict.ext)
        ? LETTERS_DIR
        : AUDIO_DIR;
      const targetPath = path.join(targetDir, verdict.name);
      const relTarget = path.relative(REPO_ROOT, targetPath);
      // Guard for files that lack an md5 (rare for binaries): treat as
      // always-changed so they re-download next run (correctness > speed).
      const md5 = file.md5Checksum ?? "";
      const prior = manifest.files[file.id];
      const onDisk = await fileExists(targetPath);

      if (md5 !== "" && prior && prior.md5 === md5 && onDisk) {
        unchangedCount++;
        continue;
      }

      const ok = await downloadFile(drive, file.id, targetPath);
      if (!ok) continue; // warning already logged; keep going

      const isNew = !prior || !onDisk;
      manifest.files[file.id] = {
        name: verdict.name,
        md5,
        target: relTarget,
        syncedAt: new Date().toISOString(),
      };
      if (isNew) {
        newCount++;
        console.log(`new: ${relTarget}`);
      } else {
        updatedCount++;
        console.log(`updated: ${relTarget}`);
      }
    }
  }

  // Loud, impossible-to-miss diagnostic when nothing is syncable. The most
  // common cause on a Shared Drive is that the service account is not a
  // member of the drive (folder-level sharing is not always enough).
  if (acceptedCount === 0) {
    console.log(
      "\n=========================================================\n" +
        "DRIVE SYNC FOUND 0 SYNCABLE FILES.\n" +
        "Most likely cause: the folder is in a Shared Drive and the\n" +
        "service account is not a member of it.\n" +
        "Fix: Google Drive -> open the Shared Drive -> Manage members ->\n" +
        `add ${clientEmail} as Viewer. Then re-run.\n` +
        `(Raw file counts seen - images: ${rawCounts.images}, audio: ${rawCounts.audio})\n` +
        "=========================================================\n",
    );
    // Nothing to commit; this is not itself a failure.
    return;
  }

  manifest.lastSync = new Date().toISOString();
  await saveManifest(manifest);

  console.log(
    `\nSync complete: ${newCount} new, ${updatedCount} updated, ` +
      `${unchangedCount} unchanged, ${skippedCount} skipped`,
  );
}

// Run only when invoked directly (node scripts/sync-drive.mjs), so tests can
// import the pure helpers above without triggering a real sync.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nDrive sync failed: ${message}`);
    process.exit(1);
  });
}
