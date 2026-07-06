import type { Metadata } from "next";
import { getAllLessons } from "@/lib/lessons";
import AuthorStudio from "@/components/AuthorStudio";

/**
 * Hidden Author Mode — /author is deliberately NOT linked from the main UI.
 * The app author opens it directly to record trace paths and reference
 * audio for lessons.
 */

export const metadata: Metadata = {
  title: "Author Mode · Serpent Alphabet",
  robots: { index: false, follow: false },
};

export default function AuthorPage() {
  const lessons = getAllLessons();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <header className="mb-5">
        <h1 className="font-ui text-2xl font-bold text-forest">Author Mode</h1>
        <p className="mt-1 font-ui text-sm text-forest-soft">
          Record trace paths and reference audio for lessons.
        </p>
      </header>
      <AuthorStudio lessons={lessons} />
    </main>
  );
}
