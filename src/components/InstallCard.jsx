import React, { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { useInstallPrompt } from '../offline';

// Install card: the install option otherwise lives inside the offline menu, where few people find it. It shows a
// few seconds in (after the map has had a first look), never once installed, and "Not now" snoozes it.

const SHOW_AFTER_MS = 6000;
const SNOOZE_DAYS = 14;
const DISMISSED_KEY = 'ktm_install_dismissed_at';

const isSnoozed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

export default function InstallCard({ hidden }) {
  const { canInstall, showIOSHint, install } = useInstallPrompt();
  const [isDue, setIsDue] = useState(false);
  const [isDismissed, setIsDismissed] = useState(isSnoozed);

  useEffect(() => {
    const timer = setTimeout(() => setIsDue(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {}
  };

  if (hidden || isDismissed || !isDue || !(canInstall || showIOSHint)) return null;

  return (
    <aside
      aria-label="Install the app"
      // Phones: clear of the tool column on the right
      className="surface pointer-events-auto w-[calc(100vw-5.25rem)] max-w-[22rem] sm:w-80 rounded-2xl p-2.5 pr-1.5 flex items-center gap-3 text-neutral-800 dark:text-neutral-100 animate-[install-in_0.35s_ease-out]"
    >
      <img src="./icons/icon-192.png" alt="" className="w-10 h-10 rounded-[10px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-tight text-neutral-900 dark:text-white">Install the app</div>
        <div className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          {canInstall ? (
            'Opens like an app and works offline.'
          ) : (
            <>
              Tap <Share className="inline w-3 h-3 -mt-0.5" aria-label="Share" /> Share, then <b className="font-semibold">Add to Home Screen</b>.
            </>
          )}
        </div>
      </div>
      {canInstall && (
        <button
          onClick={async () => {
            // Accepted: the card goes with the "installed" event. Declined: snooze like "Not now".
            if ((await install()) !== 'accepted') dismiss();
          }}
          className="btn-primary h-8 [@media(pointer:coarse)]:h-9 px-3 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
        >
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Not now"
        title="Not now"
        className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.08] cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </aside>
  );
}
