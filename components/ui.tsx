"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Shared UI primitives — every screen builds from these so the app feels
 * like one children's book: soft, rounded, generous touch targets (>=48px).
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "wisdom";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-serpent text-forest-deep shadow-node active:translate-y-1 active:shadow-none hover:bg-serpent-deep",
  secondary:
    "bg-sage-100 text-forest border-2 border-sage-300 active:bg-sage-200",
  ghost: "bg-transparent text-forest underline underline-offset-4",
  wisdom: "bg-wisdom text-white active:bg-wisdom-deep",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-blob px-6 py-3 font-ui text-lg font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-blob bg-cream-soft p-5 shadow-leaf ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The wide snake illustration for a lesson. Falls back to the glyph, large
 * on a sage background, when the image file is missing — the app must never
 * break because an illustration has not been dropped in yet.
 */
export function LessonImage({
  src,
  glyph,
  alt,
  className = "",
}: {
  src: string;
  glyph: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-blob bg-sage-200 ${className}`}
      style={{ aspectRatio: "16 / 9" }}
    >
      {failed ? (
        <div className="flex h-full w-full items-center justify-center">
          <span
            className="font-tamil text-8xl font-bold text-forest"
            aria-hidden="true"
          >
            {glyph}
          </span>
          <span className="sr-only">{alt}</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- static export-friendly, dynamic per-lesson files
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
