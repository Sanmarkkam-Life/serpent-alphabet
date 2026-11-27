import { notFound } from "next/navigation";
import SignRunner from "@/components/SignRunner";
import { getLessonById } from "@/lib/lessons";
import { getAllSigns, getSignById } from "@/lib/signs";

/** A vowel-sign (uyirmei) lesson, e.g. /sign/aa for ா. */

export function generateStaticParams(): Array<{ id: string }> {
  return getAllSigns().map((s) => ({ id: s.id }));
}

export default function SignPage({ params }: { params: { id: string } }) {
  const sign = getSignById(params.id);
  if (!sign) notFound();
  const vowel = getLessonById(sign.vowelId);
  return (
    <main className="mx-auto w-full max-w-md px-4 py-4">
      <SignRunner sign={sign} vowelAudio={vowel?.audio ?? null} />
    </main>
  );
}
