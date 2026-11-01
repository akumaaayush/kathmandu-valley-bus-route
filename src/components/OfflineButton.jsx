import React, { useEffect, useRef, useState } from 'react';
import { CloudDownload, Check, WifiOff, X, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { useOfflineMap, useInstallPrompt, useAppUpdate } from '../offline';
import InstallCard from './InstallCard';

const BUTTON_CLASS = 'map-tool';

const formatMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function ProgressRing({ progress }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="2.5" className="stroke-neutral-200 dark:stroke-neutral-700" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        className="stroke-neutral-900 dark:stroke-white transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

// hideInstallCard: something else owns the bottom of the screen (the trip planner sheet on phones)
export default function OfflineButton({ hideInstallCard = false }) {
  const { status, progress, error, totalBytes, isOnline, download } = useOfflineMap();
  const { canInstall, showIOSHint, install } = useInstallPrompt();
  const { updateReady, applyUpdate } = useAppUpdate();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsPanelOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPanelOpen]);

  // Bottom-left stack: install card, "update ready" and the offline indicator
  const statusStack = (
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-8 left-3 sm:left-4 z-[1000] flex flex-col items-start gap-2 pointer-events-none">
      <InstallCard hidden={hideInstallCard} />
      {updateReady && (
        <button
          onClick={applyUpdate}
          className="pointer-events-auto flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-medium shadow-lg shadow-black/30 border border-white/10 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          <span>New version ready</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-white text-neutral-950 font-semibold">Reload</span>
        </button>
      )}
      {!isOnline && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-950 text-white text-[11px] font-medium shadow-lg shadow-black/30 border border-white/10">
          <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          <span>{status === 'ready' ? 'Offline · full map saved' : 'Offline · only viewed areas available'}</span>
        </div>
      )}
    </div>
  );

  if (status === 'unsupported' || status === 'checking') return statusStack;

  const percent = Math.floor(progress * 100);
  const remainingBytes = totalBytes * (1 - progress);
  const title =
    status === 'ready'
      ? 'Map saved for offline use'
      : status === 'downloading'
      ? `Saving map offline… ${percent}%`
      : 'Save map for offline use';

  return (
    <>
      {statusStack}

      <div ref={containerRef} className="relative">
        <button
          onClick={() => setIsPanelOpen((open) => !open)}
          title={title}
          aria-label={title}
          aria-expanded={isPanelOpen}
          style={{ cursor: 'pointer' }}
          className={BUTTON_CLASS}
        >
          {status === 'downloading' && <ProgressRing progress={progress} />}
          {status === 'ready' ? (
            <Check className="w-4 h-4 stroke-[2.6] pointer-events-none text-emerald-600 dark:text-emerald-400" />
          ) : (
            <CloudDownload className="w-4 h-4 stroke-[2.2] pointer-events-none" />
          )}
        </button>

        {isPanelOpen && (
          <div className="surface absolute right-11 top-0 w-60 p-3 rounded-xl text-xs text-neutral-700 dark:text-neutral-300">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="font-bold text-sm text-neutral-900 dark:text-white">
                {status === 'ready' ? 'Map saved offline' : 'Save map offline'}
              </span>
              <button
                onClick={() => setIsPanelOpen(false)}
                aria-label="Close"
                className="p-0.5 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {status === 'ready' && (
              <p className="text-neutral-500 dark:text-neutral-400">
                The full map ({formatMB(totalBytes)}) works without internet, at every zoom level.
              </p>
            )}

            {status === 'downloading' && (
              <>
                <p className="text-neutral-500 dark:text-neutral-400 mb-2">
                  Saving… {percent}% ({formatMB(totalBytes * progress)} of {formatMB(totalBytes)})
                </p>
                <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                  <div className="h-full bg-neutral-900 dark:bg-white transition-[width] duration-200" style={{ width: `${percent}%` }} />
                </div>
              </>
            )}

            {(status === 'idle' || status === 'error') && (
              <>
                <p className="text-neutral-500 dark:text-neutral-400 mb-2.5">
                  {progress > 0
                    ? `Downloads the remaining ${formatMB(remainingBytes)} so the whole map works without internet.`
                    : `Downloads ${formatMB(totalBytes)} so the whole map works without internet.`}
                </p>
                {status === 'error' && (
                  <p className="text-rose-600 dark:text-rose-400 mb-2.5">{error}. Try again to resume.</p>
                )}
                <button
                  onClick={download}
                  disabled={!isOnline}
                  className="btn-primary w-full py-1.5 rounded-lg font-medium cursor-pointer"
                >
                  {!isOnline ? 'Connect to the internet to save' : status === 'error' ? 'Retry' : 'Save map'}
                </button>
              </>
            )}

            {(canInstall || showIOSHint) && (
              <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-white/10">
                {canInstall ? (
                  <button
                    onClick={install}
                    className="w-full py-1.5 rounded-lg border border-neutral-200 dark:border-white/15 font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                  >
                    <MonitorSmartphone className="w-3.5 h-3.5" />
                    Install as app
                  </button>
                ) : (
                  <p className="text-neutral-500 dark:text-neutral-400">
                    Install as app: tap <span className="font-semibold">Share</span>, then{' '}
                    <span className="font-semibold">Add to Home Screen</span>.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
