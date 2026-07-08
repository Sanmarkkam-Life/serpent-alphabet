# Serpent Alphabet 🐍

A mobile-first PWA for learning the Tamil alphabet, one letter at a time,
with a friendly snake as the guide. It installs to the phone home screen
like a native app, runs entirely in the browser (no backend, no accounts),
and every letter is a data file, so the alphabet grows without code changes.

The learner walks a winding jungle path: first two short intro cards, then
the twelve vowels, each mastered through a small set of tasks before the
next letter unlocks.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest: mastery queue, XP, streak, trace, validators
npm run build    # production build (must pass cleanly)
```

## The learner journey

1. **About Tamil** (`/about`): a short card on the language itself. Viewing
   it unlocks the next intro.
2. **The Soul Letters** (`/intro`): introduces vowels (உயிர், the soul) and
   consonants (மெய், the body). Viewing it unlocks the first letter.
3. **Letters**: each runs a **mastery queue** of tasks:
   `learn → pronounce → trace → recognize ×3`.

### Mastery rules

Failing a task sends it to the back of the queue, and a failed task must
then be **passed twice in a row** to clear. The lesson completes only when
the queue is empty; a failure never restarts the whole lesson, only that
task. The pure engine lives in `lib/masteryQueue.ts` (unit-tested).

### The four tasks

- **Learn**: the illustration, glyph, phonetic, teaching notes, and an
  optional gold "Vallalar's light" wisdom card.
- **Pronounce**: plays the reference audio ("Hear the teacher"), lets the
  learner record and compare, then self-assess. Missing audio degrades to a
  "say it aloud" flow. (Mute silences only the app's sound effects, never
  the reference pronunciation.)
- **Trace**: the learner traces the letter inside a forgiving corridor,
  one or more strokes, before a gentle timer runs out. See multi-stroke
  below.
- **Recognize**: "Which is the correct one?", cued by the sound (a speaker
  button + the phonetic), choosing the glyph from a shuffled 2×2 grid.

### Rewards

- **XP** per task, with a per-lesson **combo** multiplier and a small
  **time bonus** for quick trace/recognize.
- **Flawless streak**: a global ⚡ count of consecutive clean passes that
  survives across lessons and sessions; it resets to 0 on any mistake and
  multiplies the end-of-lesson XP (up to 2× at 50+).
- **Snake levels** (Hatchling → Naga) and a quiet **daily streak** (🔥),
  both shown on the home screen. Tunable in `lib/levels.ts` and
  `lib/streak.ts`.
- **Test-out**: an "I already know this letter" shortcut on an unlocked
  lesson: pass one trace + one recognize first try to skip ahead.
- **Review**: completed letters replay at half XP without affecting
  progress.

Progress (completed letters, XP, level, streaks, mute, intro flags) lives
in `localStorage` under `serpent_progress_v2`; v1 data migrates
automatically and is kept as a backup. Clearing site data resets the
journey.

## Adding a letter

The engine loads every JSON in `content/lessons/` sorted by `order`, so a
new letter is a JSON file plus an image and an audio clip. There are three
ways to get those in; the first two need no local setup.

### The lesson JSON

Copy `content/lessons/a.json` to `content/lessons/<id>.json` and edit:

- `id`: matches the filename (`"aa"`)
- `order`: position on the path (`2`)
- `glyph`, `phonetic`: the letter (`"ஆ"`) and its sound cue (`"Aah!"`)
- `peculiarities`: teaching text (`\n\n` for paragraph breaks)
- `vallalar_note`: the wisdom-card text, or `null` to hide it
- `distractors`: exactly 3 wrong-answer glyphs (put the letter's short/long
  counterpart first; length confusion is the real challenge)
- `image`: `/letters/<glyph>.png` (files are named by the glyph itself,
  e.g. `/letters/ஆ.png`). A missing image falls back to the glyph.
- `audio`: `/audio/<glyph>.mp3`. Missing audio falls back to "say it aloud".
- `trace_time_limit` (seconds) and `trace_tolerance` (corridor half-width in
  px at a 390px reference width). Complex letters (ஐ, ஔ) get a longer limit.
- `trace_path`: leave `[]`; author it in `/author` (below).

### Trace paths in Author Mode (`/author`, hidden)

Open `/author` on a phone (the canvas matches the learner's geometry). A
live status board shows which letters are traced or pending. Pick a letter
and draw it the way a learner should write it:

- **Lift between strokes.** Each lift ends a stroke and the next touch
  starts a new one, so multi-stroke letters (ஐ, ஔ, …) are natural.
- **Undo stroke** / **Clear all** to fix mistakes; **Preview** replays it;
  **Test it** runs the real trace task against your path.
- **Save to GitHub** commits the path straight into the lesson JSON (one
  tap; needs the author password and the env vars below). If saving fails,
  the JSON is copied to the clipboard as a fallback so a trace is never lost.

Trace paths are stored in normalized 0–1 coordinates as an array of strokes
(`[[[x,y],…],[[x,y],…]]`); the legacy flat single-stroke form still loads.

### Content pipelines

Two GitHub Actions bring assets in from Google Drive and ElevenLabs so the
team can add content without touching the repo:

- **Sync Drive content** (`.github/workflows/sync-drive-content.yml`,
  `scripts/sync-drive.mjs`): every 6h and on demand, mirrors letter images
  and audio from a shared Drive folder into `public/letters` and
  `public/audio`. Drop a file in Drive → it appears in the app.
- **Generate audio** (`.github/workflows/generate-audio.yml`,
  `scripts/generate-audio.mjs`): synthesizes pronunciations with the
  ElevenLabs API and uploads them to the Drive audio folder (the sync then
  picks them up). Run it from the Actions tab with a chosen voice;
  `scripts/pronunciation-map.json` is the master list of what to generate.

## Environment variables

Server-side only; set them in Vercel (Project Settings → Environment
Variables) and, for local dev, in a `.env.local` (see `.env.local.example`).
None are exposed to the browser.

- `GITHUB_TOKEN`: fine-grained PAT scoped to this repo only, **Contents:
  Read and write**. Powers the `/author` one-tap save.
- `AUTHOR_PASSWORD`: gates `/author` saving; entered once in the UI.
- `GOOGLE_SERVICE_ACCOUNT_KEY`: service-account JSON for the Drive sync and
  audio upload (Contributor access on the shared Drive to upload).
- `ELEVENLABS_API_KEY`: for the audio generator.
- `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_BRANCH`: optional
  overrides (defaults match this repo).

## Deploy to Vercel (free)

1. Push this repository to GitHub.
2. [vercel.com](https://vercel.com) → **Add New → Project → Import** the repo.
3. Next.js is auto-detected; click **Deploy**. Add the env vars above for
   `/author` saving and the pipelines to work in production.
4. Every push to `main` redeploys automatically; the free Hobby tier is
   plenty. From the terminal: `npx vercel` then `npx vercel --prod`.

### Install it like an app

- **iPhone (Safari):** open the site → Share → **Add to Home Screen**.
- **Android (Chrome):** the **Install app** prompt, or ⋮ → **Add to Home
  screen**.

## Tech notes

- Next.js 14 (App Router) + TypeScript strict + Tailwind CSS.
- PWA: `app/manifest.ts` + a hand-rolled service worker (`public/sw.js`),
  registered in production builds only.
- Fonts self-hosted (Noto Sans Tamil for glyphs, Nunito for UI): offline,
  no build-time font fetches.
- Server-side API routes (`app/api/`) hold the write token; trace status
  and saves never expose secrets to the client.
- Pure, unit-tested modules in `lib/` (mastery queue, XP, levels, streak,
  trace validation, progress migration). Run `npm test`.
- No backend; deployable anywhere that runs Next.js.

---

Made by Sanmarkkam Life
