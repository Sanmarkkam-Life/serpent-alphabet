"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AMOUNT_OPTIONS,
  DEFAULT_AMOUNT,
  DEFAULT_INTERVAL,
  donorboxUrl,
  parseCustomAmount,
  type Interval,
  type Placement,
} from "@/lib/giving";

/**
 * The donate panel: a sheet that slides up over the current screen.
 * Step 1: once or monthly, and an amount (presets or the learner's own).
 * Step 2: the organisation's Donorbox form inside the app, pre-filled, where
 * the learner pays with card, Apple Pay, Google Pay or PayPal.
 * No payment details ever touch TamiLearn itself.
 */

export interface DonatePanelProps {
  open: boolean;
  placement: Placement;
  onClose: () => void;
}

type Step = "choose" | "pay";

export default function DonatePanel({ open, placement, onClose }: DonatePanelProps) {
  const [step, setStep] = useState<Step>("choose");
  const [interval, setIntervalChoice] = useState<Interval>(DEFAULT_INTERVAL);
  const [preset, setPreset] = useState<number | null>(DEFAULT_AMOUNT);
  const [custom, setCustom] = useState("");
  const titleId = useId();
  const customId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Fresh start every time the panel opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    setStep("choose");
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const customAmount = parseCustomAmount(custom);
  const amount = preset ?? customAmount;
  const customInvalid = preset === null && custom.trim() !== "" && customAmount === null;
  const selected = AMOUNT_OPTIONS.find((o) => o.amount === preset);
  const monthly = interval === "monthly";

  const intervalButton = (value: Interval, label: string, note?: string) => {
    const active = interval === value;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setIntervalChoice(value)}
        className={`flex flex-1 flex-col items-center rounded-2xl border-2 px-3 py-2.5 font-ui transition-colors ${
          active
            ? "border-forest bg-forest text-cream"
            : "border-sage-200 bg-cream-soft text-forest"
        }`}
      >
        <span className="text-base font-extrabold">{label}</span>
        {note && (
          <span
            className={`text-xs font-bold ${active ? "text-serpent-soft" : "text-wisdom-deep"}`}
          >
            {note}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/50 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-md flex-col rounded-t-blob bg-cream shadow-leaf sm:rounded-blob ${
          step === "pay" ? "h-[92dvh]" : "max-h-[92dvh]"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center gap-3 px-5 pb-2 pt-4">
          {step === "pay" && (
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="font-ui text-sm font-bold text-forest underline underline-offset-4"
            >
              ← Back
            </button>
          )}
          <h2 id={titleId} className="flex-1 font-ui text-xl font-extrabold text-forest">
            {step === "choose" ? "Donate to Sanmarkkam Life" : `Donate €${amount}${monthly ? " a month" : ""}`}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-soft font-ui text-xl font-bold text-forest"
          >
            ×
          </button>
        </div>

        {step === "choose" ? (
          <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-5">
            <p className="font-ui text-sm leading-relaxed text-forest-soft">
              TamiLearn is free for everyone, offered in compassion. Your gift
              keeps it free and carries Vallalar&apos;s compassion further.
            </p>

            <div className="flex gap-3" role="group" aria-label="How often">
              {intervalButton("monthly", "Monthly", "Helps us most")}
              {intervalButton("once", "Once")}
            </div>

            <div className="mt-1 grid grid-cols-3 gap-3" role="group" aria-label="Amount">
              {AMOUNT_OPTIONS.map((o) => {
                const active = preset === o.amount;
                return (
                  <button
                    key={o.amount}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPreset(o.amount)}
                    className={`relative rounded-2xl border-2 pb-2.5 pt-4 font-ui text-xl font-extrabold transition-colors ${
                      active
                        ? "border-serpent-deep bg-serpent text-forest-deep"
                        : "border-sage-200 bg-cream-soft text-forest"
                    }`}
                  >
                    €{o.amount}
                    {o.amount === DEFAULT_AMOUNT && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-wisdom px-2 py-0.5 font-ui text-[10px] font-extrabold uppercase tracking-wide text-cream">
                        Suggested
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor={customId} className="font-ui text-sm font-bold text-forest">
                Or your own amount
              </label>
              <div
                className={`mt-1 flex items-center rounded-2xl border-2 bg-cream-soft px-3 ${
                  preset === null ? "border-serpent-deep" : "border-sage-200"
                }`}
              >
                <span className="font-ui text-lg font-bold text-forest-soft">€</span>
                <input
                  id={customId}
                  inputMode="decimal"
                  placeholder="Any amount"
                  value={custom}
                  onFocus={() => setPreset(null)}
                  onChange={(e) => {
                    setPreset(null);
                    setCustom(e.target.value);
                  }}
                  className="w-full bg-transparent px-2 py-2.5 font-ui text-lg font-bold text-forest outline-none placeholder:font-semibold placeholder:text-forest-soft/60"
                />
              </div>
              {customInvalid && (
                <p className="mt-1 font-ui text-xs font-semibold text-serpent-deep">
                  Enter a whole amount from €1 to €10,000.
                </p>
              )}
            </div>

            <p className="min-h-[2.5rem] rounded-2xl bg-wisdom-soft px-4 py-2.5 font-ui text-sm leading-snug text-forest">
              {selected
                ? `${selected.label}: ${selected.impact}`
                : "Every gift is received with the same gratitude, whatever its size."}
            </p>

            <button
              type="button"
              disabled={amount === null}
              onClick={() => setStep("pay")}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-blob bg-serpent px-6 py-3 font-ui text-lg font-extrabold text-forest-deep shadow-node transition-all duration-150 hover:bg-serpent-deep active:translate-y-1 active:shadow-none disabled:opacity-50"
            >
              {amount === null ? "Choose an amount" : `Donate €${amount}${monthly ? " monthly" : ""}`}
            </button>

            <p className="text-center font-ui text-xs leading-relaxed text-forest-soft">
              Card · Apple Pay · Google Pay · PayPal. Secure form by Donorbox,
              official receipt by email.{monthly ? " Cancel monthly giving anytime." : ""}
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3">
            <iframe
              title="Secure donation form"
              src={donorboxUrl({ amount: amount ?? DEFAULT_AMOUNT, interval, placement, embed: true })}
              allow="payment"
              className="min-h-0 w-full flex-1 rounded-2xl border-0 bg-white"
            />
            <a
              href={donorboxUrl({ amount: amount ?? DEFAULT_AMOUNT, interval, placement, embed: false })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center font-ui text-xs font-bold text-forest-soft underline underline-offset-4"
            >
              Form not loading? Open it in a new tab
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
