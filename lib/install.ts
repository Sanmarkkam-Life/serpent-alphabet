"use client";

/**
 * Installing TamiLearn on the home screen.
 *
 * Android browsers (Chrome, Brave, Edge, Samsung Internet) fire a
 * `beforeinstallprompt` event that lets us show the real install dialog with
 * one tap. It fires once, early, so it is caught on every page (see
 * ServiceWorkerRegister) and kept here until the Install button asks for it.
 * iPhones never fire it: Apple only allows Share → Add to Home Screen, so the
 * button shows those steps instead.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Call once on every page load (done in ServiceWorkerRegister). */
export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as InstallPromptEvent;
    notify();
  };
  const onInstalled = () => {
    deferred = null;
    notify();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Shows the browser's own install dialog. Returns true if the learner accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === "accepted";
}

/** Already running as an installed app. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneIOS = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneIOS || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac with touch.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Inside the frame on sanmarkkamlife.org, where installing is not possible. */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export const APP_URL = "https://serpent-alphabet.vercel.app/";
