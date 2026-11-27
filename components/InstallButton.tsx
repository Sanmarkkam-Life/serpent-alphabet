"use client";

import { useEffect, useState } from "react";
import {
  APP_URL,
  canPromptInstall,
  isEmbedded,
  isInstalled,
  isIOS,
  promptInstall,
  subscribeInstall,
} from "@/lib/install";

/**
 * "Install TamiLearn": one tap on Android (the browser's own dialog), the
 * Safari steps on iPhone, and the menu steps elsewhere. Hidden once the app
 * runs installed. Inside the website frame it opens the app full screen,
 * because a framed page cannot be installed.
 */

type Help = null | "ios" | "other";

export default function InstallButton() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [oneTap, setOneTap] = useState(false);
  const [help, setHelp] = useState<Help>(null);
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    setEmbedded(isEmbedded());
    setOneTap(canPromptInstall());
    setReady(true);
    return subscribeInstall(() => {
      setOneTap(canPromptInstall());
      setInstalled(isInstalled());
    });
  }, []);

  if (!ready || installed) return null;

  const onClick = async () => {
    if (embedded) {
      window.open(APP_URL, "_blank", "noopener");
      return;
    }
    if (oneTap) {
      const accepted = await promptInstall();
      if (accepted) setInstalled(true);
      return;
    }
    setHelp(isIOS() ? "ios" : "other");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        className="rounded-full border-2 border-forest px-4 py-1.5 font-ui text-sm font-bold text-forest"
      >
        📲 {embedded ? "Open to install" : "Install"}
      </button>

      {help && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/50 sm:items-center"
          onClick={() => setHelp(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-help-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-blob bg-cream p-6 text-left shadow-leaf sm:rounded-blob"
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <h2 id="install-help-title" className="font-ui text-xl font-extrabold text-forest">
              Put TamiLearn on your home screen
            </h2>
            <p className="mt-1 font-ui text-sm text-forest-soft">
              No app store needed. It installs from the browser, takes little space and updates itself.
            </p>
            {help === "ios" ? (
              <ol className="mt-4 list-decimal space-y-2 pl-5 font-ui text-base text-forest">
                <li>Make sure this page is open in <b>Safari</b>.</li>
                <li>
                  Tap the <b>Share</b> button{" "}
                  <span aria-hidden="true" className="inline-block rounded border border-forest px-1 text-sm leading-tight">
                    ⬆︎
                  </span>{" "}
                  (a square with an arrow, at the bottom or top of the screen).
                </li>
                <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              </ol>
            ) : (
              <ol className="mt-4 list-decimal space-y-2 pl-5 font-ui text-base text-forest">
                <li>Open the browser menu: <b>⋮</b> (top right) or <b>≡</b>.</li>
                <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
                <li>Confirm with <b>Install</b> or <b>Add</b>.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setHelp(null)}
              className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center rounded-blob bg-serpent font-ui text-base font-extrabold text-forest-deep shadow-node"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
