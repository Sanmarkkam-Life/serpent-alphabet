# Serpent Alphabet 🐍

A mobile-first PWA for learning the Tamil alphabet, one letter at a time,
with a friendly snake as the guide. Every lesson runs a strict
**mastery queue**: learn the letter, pronounce it, trace it along the
snake's path, and recognize it three times. The next letter on the
winding jungle path unlocks only when the queue is truly cleared. No
backend, no accounts: everything runs in the browser and installs to the
home screen like a native app.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest: mastery queue + trace validation
npm run build    # production build (must pass cleanly)
```

## How to add a new letter

Adding a letter requires **no code changes**. The lesson engine loads every
JSON file in `content/lessons/` sorted by its `order` field.

1. **Create the lesson JSON.** Copy `content/lessons/a.json` to
   `content/lessons/<id>.json` (e.g. `aa.json`) and edit:
   - `id`: must match the filename (`"aa"`)
   - `order`: its position on the path (`2`)
   - `glyph`, `phonetic`: the letter (`"ஆ"`) and its sound cue (`"Aah!"`)
   - `peculiarities`: the teaching text (use `\n\n` for paragraph breaks)
   - `vallalar_note`: the wisdom-card text, or `null` to hide the card
   - `distractors`: exactly 3 wrong-answer glyphs for the Recognize task

2. **Drop in the illustration.** Put the wide (~16:9) snake image at
   `public/letters/<id>.png` and point the `image` field at it. If the
   image is missing the app shows the glyph as a graceful fallback, so
   nothing breaks.

3. **Record the trace path.** Open the hidden route **`/author`**
   (ideally on a phone, since the canvas has the same geometry learners see),
   pick the lesson, and trace the letter once with one continuous stroke,
   the way a learner should write it. Then:
   - **Preview** replays your stroke,
   - **Test it** runs the real trace task against your path,
   - **Copy JSON** copies the normalized point array. Paste it into the
     lesson's `"trace_path"` field.
   Paths are stored in normalized 0–1 coordinates, so a path recorded on
   one phone works on every device. `trace_time_limit` (seconds) and
   `trace_tolerance` (corridor width in px at a 390px-wide reference
   canvas) can be tuned per letter.

4. **Record the pronunciation.** Still in `/author`, record the reference
   audio, download it, drop the file into `public/audio/`, and set the
   lesson's `"audio"` field to match (e.g. `"/audio/aa.m4a"`). Browsers
   record m4a (iOS) or webm (Android/Chrome); both play fine. If the
   audio file is missing, the Pronounce task falls back to a
   "say it aloud" flow. The app never crashes on a missing file.

5. **Restart the dev server** (lesson JSON is read at build time) or
   redeploy. The new letter appears on the path, locked until every
   earlier letter is mastered.

## The mastery rules

Each lesson runs the task queue `learn → pronounce → trace → recognize ×3`.
Failing a task sends it to the back of the queue, and a failed task must
then be **passed twice in a row** to clear. The lesson is complete only
when the queue is empty. Failure never restarts the whole lesson, only
that task.

## Progress storage

Learner progress lives in `localStorage` under the versioned key
`serpent_progress_v1`. Clearing site data resets the journey. There is no
server and no account.

## Deploy to Vercel (free)

1. Push this repository to GitHub.
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, and
   **Add New → Project → Import** the repository.
3. Vercel auto-detects Next.js with no configuration needed. Click **Deploy**.
4. Every push to the main branch redeploys automatically. The free Hobby
   tier is more than enough.

Or from the terminal: `npx vercel` (then `npx vercel --prod`).

### Install it like an app

- **iPhone (Safari):** open the site → Share → **Add to Home Screen**.
- **Android (Chrome):** open the site → the **Install app** prompt, or
  ⋮ menu → **Add to Home screen**.

## Tech notes

- Next.js 14 (App Router) + TypeScript strict + Tailwind CSS
- PWA: `app/manifest.ts` + a hand-rolled service worker (`public/sw.js`),
  registered in production builds only
- Fonts self-hosted (Noto Sans Tamil for glyphs, Nunito for UI): works
  offline, no build-time font fetches
- The mastery queue (`lib/masteryQueue.ts`) and trace validation
  (`lib/trace.ts`) are pure modules covered by vitest (`npm test`)
- No backend; deployable anywhere static-friendly that runs Next.js

---

Made by Sanmarkkam Life
