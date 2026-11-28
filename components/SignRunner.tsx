"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Compound, Sign } from "@/lib/signs";
import { Button, Card } from "@/components/ui";
import { feedbackFail, feedbackFanfare, feedbackPass } from "@/lib/sfx";
import { addXp, markLessonComplete, recordTaskActivity } from "@/lib/progress";

/**
 * A vowel-sign lesson (uyirmei): meet the sign, build letters with it,
 * hear and choose, then read a few real words. Wrong answers come back
 * at the end of the queue, as in the letter lessons.
 */

type Step =
  | { kind: "meet" }
  | { kind: "build"; target: Compound; options: Compound[] }
  | { kind: "hear"; target: Compound; options: Compound[] }
  | { kind: "read"; word: string; translit: string; meaning: string; options: string[] };

const XP_PER_TASK = 10;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function withDistractors(target: Compound, all: Compound[]): Compound[] {
  const others = shuffle(all.filter((c) => c.id !== target.id)).slice(0, 3);
  return shuffle([target, ...others]);
}

function buildQueue(sign: Sign): Step[] {
  const picks = shuffle(sign.compounds);
  const build: Step[] = picks.slice(0, 3).map((target) => ({
    kind: "build",
    target,
    options: withDistractors(target, sign.compounds),
  }));
  const hear: Step[] = picks.slice(3, 7).map((target) => ({
    kind: "hear",
    target,
    options: withDistractors(target, sign.compounds),
  }));
  const meanings = sign.words.map((w) => w.meaning);
  const read: Step[] = sign.words.map((w) => ({
    kind: "read",
    ...w,
    options: shuffle(meanings),
  }));
  return [{ kind: "meet" }, ...build, ...hear, ...read];
}

function play(
  src: string | null | undefined,
  ref: React.MutableRefObject<HTMLAudioElement | null>,
) {
  if (!src) return;
  ref.current?.pause();
  const el = new Audio(src);
  ref.current = el;
  void el.play().catch(() => undefined);
}

export default function SignRunner({
  sign,
  vowelAudio,
}: {
  sign: Sign;
  vowelAudio: string | null;
}) {
  const [queue, setQueue] = useState<Step[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [xp, setXp] = useState(0);
  const [done, setDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Shuffle after mount only, so the server and phone render the same HTML.
  useEffect(() => setQueue(buildQueue(sign)), [sign]);

  const step = queue?.[0];

  useEffect(() => {
    setPicked(null);
    setJoined(false);
    if (step?.kind === "hear") play(step.target.audio, audioRef);
  }, [step]);

  if (!queue) return null;

  const total = 1 + 3 + 4 + sign.words.length;
  const progress = Math.min(1, (total - queue.length) / total);

  const reward = () => {
    feedbackPass();
    addXp(XP_PER_TASK);
    recordTaskActivity();
    setXp((v) => v + XP_PER_TASK);
  };

  const next = (correct: boolean) => {
    const [head, ...rest] = queue;
    const after = correct || head.kind === "meet" ? rest : [...rest, head];
    if (after.length === 0) {
      markLessonComplete(`sign-${sign.id}`);
      feedbackFanfare();
      setDone(true);
    }
    setQueue(after);
  };

  const answer = (choice: string, correctValue: string) => {
    if (picked) return;
    setPicked(choice);
    if (choice === correctValue) reward();
    else feedbackFail();
  };

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-4 text-center">
        <div className="font-tamil text-7xl font-bold text-forest">{sign.sign}</div>
        <h1 className="font-ui text-2xl font-extrabold text-forest">
          You learned {sign.name.toLowerCase()}!
        </h1>
        <p className="font-ui text-base text-forest-soft">
          Every body letter can wear it now:{" "}
          <span className="font-tamil text-forest">
            {sign.compounds.slice(0, 4).map((c) => c.glyph).join(" ")} … {sign.compounds[17]?.glyph}
          </span>
          . +{xp} XP
        </p>
        <Link href="/" className="w-full">
          <Button fullWidth>Back to the path</Button>
        </Link>
      </Card>
    );
  }
  if (!step) return null;

  const tone = (value: string, correct: string) =>
    picked === null
      ? ""
      : value === correct
        ? "!border-serpent bg-serpent-soft"
        : value === picked
          ? "!border-red-400 bg-red-50"
          : "opacity-50";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="Close lesson"
          className="flex h-12 w-12 items-center justify-center text-2xl text-forest-soft"
        >
          ✕
        </Link>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-sage-100">
          <div
            className="h-full rounded-full bg-serpent transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {step.kind === "meet" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="font-ui text-sm font-extrabold uppercase tracking-widest text-forest-soft">
            A new sign
          </p>
          {sign.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sign.image} alt="" className="w-full rounded-2xl" />
          ) : (
            <div className="font-tamil text-8xl font-bold text-forest">{sign.sign}</div>
          )}
          <h1 className="font-ui text-2xl font-extrabold text-forest">{sign.name}</h1>
          <p className="font-ui text-base text-forest">{sign.costume}</p>
          <p className="font-ui text-sm text-forest-soft">
            It is the soul letter{" "}
            <span className="font-tamil text-lg text-forest">{sign.vowelGlyph}</span> ({sign.sound})
            giving life to a body letter.
          </p>
          {sign.irregular && (
            <div className="grid w-full grid-cols-6 gap-1.5">
              {sign.compounds.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => play(c.audio, audioRef)}
                  className="flex flex-col items-center rounded-xl bg-cream py-1"
                >
                  <span className="font-tamil text-2xl font-bold text-forest">{c.glyph}</span>
                  <span className="font-ui text-[10px] text-forest-soft">{c.translit}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 font-tamil text-5xl font-bold text-forest">
            <span>{sign.compounds[0]?.consonant}</span>
            <span className="font-ui text-2xl">+</span>
            <span>{sign.sign}</span>
            <span className="font-ui text-2xl">=</span>
            <span>{sign.compounds[0]?.glyph}</span>
          </div>
          {vowelAudio && (
            <Button variant="secondary" onClick={() => play(vowelAudio, audioRef)}>
              🔊 Hear {sign.sound}
            </Button>
          )}
          <Button fullWidth onClick={() => next(true)}>
            Continue
          </Button>
        </Card>
      )}

      {step.kind === "build" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="font-ui text-lg font-extrabold text-forest">
            Build <span className="text-wisdom-deep">{step.target.translit}</span>
          </p>
          <p className="font-ui text-sm text-forest-soft">
            Pick the body letter, then join the sign.
          </p>
          <div className="flex items-center gap-3 font-tamil text-6xl font-bold text-forest">
            <span className="min-w-[64px]">
              {joined && picked ? `${picked}${sign.sign}` : (picked ?? "?")}
            </span>
            {!joined && (
              <>
                <span className="font-ui text-2xl">+</span>
                <span>{sign.sign}</span>
              </>
            )}
          </div>
          <div className="grid w-full grid-cols-4 gap-2">
            {step.options.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={joined}
                onClick={() => setPicked(o.consonant)}
                className={`min-h-[64px] rounded-2xl border-2 bg-cream font-tamil text-3xl font-bold text-forest ${
                  picked === o.consonant ? "border-forest" : "border-sage-300"
                }`}
              >
                {o.consonant}
              </button>
            ))}
          </div>
          {!joined ? (
            <Button
              fullWidth
              disabled={!picked}
              onClick={() => {
                setJoined(true);
                if (picked === step.target.consonant) {
                  reward();
                  play(step.target.audio, audioRef);
                } else feedbackFail();
              }}
            >
              Join
            </Button>
          ) : (
            <Feedback
              ok={picked === step.target.consonant}
              answer={`${step.target.glyph} (${step.target.translit})`}
              onNext={() => next(picked === step.target.consonant)}
            />
          )}
        </Card>
      )}

      {step.kind === "hear" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="font-ui text-lg font-extrabold text-forest">
            {step.target.audio ? (
              "Which letter do you hear?"
            ) : (
              <>
                Which letter says{" "}
                <span className="text-wisdom-deep">{step.target.translit}</span>?
              </>
            )}
          </p>
          {step.target.audio && (
            <Button variant="secondary" onClick={() => play(step.target.audio, audioRef)}>
              🔊 Play again
            </Button>
          )}
          <div className="grid w-full grid-cols-2 gap-3">
            {step.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => answer(o.id, step.target.id)}
                className={`min-h-[80px] rounded-2xl border-2 border-sage-300 bg-cream font-tamil text-5xl font-bold text-forest ${tone(o.id, step.target.id)}`}
              >
                {o.glyph}
              </button>
            ))}
          </div>
          {picked && (
            <Feedback
              ok={picked === step.target.id}
              answer={`${step.target.glyph} (${step.target.translit})`}
              onNext={() => next(picked === step.target.id)}
            />
          )}
        </Card>
      )}

      {step.kind === "read" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <p className="font-ui text-sm font-extrabold uppercase tracking-widest text-forest-soft">
            Read a word
          </p>
          <div className="font-tamil text-6xl font-bold text-forest">{step.word}</div>
          <p className="font-ui text-base text-forest-soft">What does it mean?</p>
          <div className="flex w-full flex-col gap-2">
            {step.options.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => answer(m, step.meaning)}
                className={`min-h-[52px] rounded-2xl border-2 border-sage-300 bg-cream font-ui text-lg font-bold text-forest ${tone(m, step.meaning)}`}
              >
                {m}
              </button>
            ))}
          </div>
          {picked && (
            <Feedback
              ok={picked === step.meaning}
              answer={`${step.word} (${step.translit}) = ${step.meaning}`}
              onNext={() => next(picked === step.meaning)}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function Feedback({
  ok,
  answer,
  onNext,
}: {
  ok: boolean;
  answer: string;
  onNext: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2" role="status" aria-live="polite">
      <p className={`font-ui text-base font-extrabold ${ok ? "text-forest" : "text-red-700"}`}>
        {ok ? "Well done!" : `Not quite. It is ${answer}. It will come back.`}
      </p>
      <Button fullWidth onClick={onNext}>
        Continue
      </Button>
    </div>
  );
}
