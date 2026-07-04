import { getAllLessons } from "@/lib/lessons";
import HomePath from "@/components/HomePath";

/**
 * Home screen (server component). Loads every lesson from /content/lessons
 * on the server, strips it down to the serializable bits the path needs,
 * and hands them to the client-side winding path.
 */
export default function HomePage() {
  const lessons = getAllLessons().map((lesson) => ({
    id: lesson.id,
    order: lesson.order,
    glyph: lesson.glyph,
    phonetic: lesson.phonetic,
  }));

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-6 pt-10">
      <header className="flex flex-col items-center text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-sage-100 text-4xl shadow-leaf"
          aria-hidden="true"
        >
          🐍
        </div>
        <h1 className="mt-4 font-ui text-3xl font-extrabold tracking-tight text-forest">
          Serpent Alphabet
        </h1>
        <p className="mt-1 font-ui text-sm font-semibold text-forest-soft">
          Learn Tamil, one letter at a time
        </p>
        {/* A quiet serpent squiggle to set the trail motif. */}
        <svg
          viewBox="0 0 120 20"
          className="mt-4 h-4 w-28 text-serpent"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 12 C 18 2, 30 2, 44 12 C 58 22, 70 22, 84 12 C 92 6, 100 5, 108 8"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle cx="113" cy="8" r="4" fill="#2E5B3E" />
        </svg>
      </header>

      <section aria-label="Learning path" className="mt-8">
        <HomePath lessons={lessons} />
      </section>

      <footer className="mt-auto pt-12 text-center font-ui text-xs text-sage-500">
        Made by Pushkar · Sanmarkkam Life
      </footer>
    </main>
  );
}
