import { notFound } from "next/navigation";
import LessonRunner from "@/components/LessonRunner";
import { getAllLessons, getLessonById, getOrderedLessonIds } from "@/lib/lessons";

/**
 * Lesson route — server component. Loads the lesson JSON at build time and
 * hands a fully serializable lesson (plus a tiny "next lesson" summary) to
 * the client-side runner.
 */

export function generateStaticParams(): Array<{ id: string }> {
  return getOrderedLessonIds().map((id) => ({ id }));
}

interface LessonPageProps {
  params: { id: string };
}

export default function LessonPage({ params }: LessonPageProps) {
  const lesson = getLessonById(params.id);
  if (!lesson) {
    notFound();
  }

  const lessons = getAllLessons();
  const index = lessons.findIndex((entry) => entry.id === lesson.id);
  const next =
    index >= 0 && index + 1 < lessons.length ? lessons[index + 1] : null;
  const nextLesson =
    next === null
      ? null
      : { id: next.id, glyph: next.glyph, phonetic: next.phonetic };

  return <LessonRunner lesson={lesson} nextLesson={nextLesson} />;
}
