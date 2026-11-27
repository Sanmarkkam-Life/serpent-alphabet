/**
 * A short teaching of Vallalar (Ramalinga Adigal) with its source in our
 * published translations. Used on the intro screens.
 */
export default function VallalarQuote({
  lines,
  source,
}: {
  lines: string[];
  source: string;
}) {
  return (
    <figure className="mt-5 rounded-2xl bg-cream-soft p-4">
      <figcaption className="mb-2 flex items-center gap-2 font-ui text-xs font-extrabold uppercase tracking-wide text-wisdom-deep">
        <span aria-hidden="true">🪔</span> Vallalar&apos;s light
      </figcaption>
      {lines.map((line) => (
        <blockquote
          key={line}
          className="mt-1 font-ui text-base font-medium italic leading-relaxed text-forest"
        >
          {line}
        </blockquote>
      ))}
      <p className="mt-2 font-ui text-xs font-semibold text-wisdom-deep">Source: {source}</p>
    </figure>
  );
}
