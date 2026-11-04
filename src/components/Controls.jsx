import React, { useState, useEffect } from 'react';
import { Plus, Minus, Maximize, Minimize, BookOpen, Sun, Moon, Share2, Check, Navigation, CircleHelp } from 'lucide-react';
import OfflineButton from './OfflineButton';
import { shareLink } from '../shareLink';

export default function Controls({
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleLegend,
  isLegendOpen,
  onToggleTrip,
  isTripOpen,
  theme,
  onToggleTheme,
  onOpenHelp,
  isHelpOpen,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const [isLinkCopied, setIsLinkCopied] = useState(false);

  useEffect(() => {
    if (!isLinkCopied) return;
    const timer = setTimeout(() => setIsLinkCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [isLinkCopied]);

  // The URL always reflects the selected route & place (see shareLink.js), so share it as-is
  const shareCurrentView = async () => {
    if ((await shareLink()) === 'copied') setIsLinkCopied(true);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const isDark = theme === 'dark';
  const canFullscreen = Boolean(document.fullscreenEnabled);

  return (
    <>
    {/* Zoom and reset: bottom centre, in thumb reach on phones. Hidden on smaller screens while the trip panel is open
        (bottom sheet on phones, side panel that would overlap it on tablets). */}
    <div
      role="group"
      aria-label="Zoom"
      className={`surface absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[1000] items-center rounded-full p-0.5 ${
        isTripOpen ? 'hidden lg:flex' : 'flex'
      }`}
    >
      <button onClick={onZoomOut} data-tip="Zoom out" aria-label="Zoom out" className="map-tool rounded-full">
        <Minus className="w-4 h-4 stroke-[2] pointer-events-none" />
      </button>
      <div className="w-px h-4 bg-neutral-200 dark:bg-white/10" />
      <button
        onClick={onResetView}
        data-tip="Show the whole map"
        aria-label="Reset map view"
        className="h-8 [@media(pointer:coarse)]:h-10 px-3 rounded-full text-xs font-medium text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:text-white dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
      >
        Reset
      </button>
      <div className="w-px h-4 bg-neutral-200 dark:bg-white/10" />
      <button onClick={onZoomIn} data-tip="Zoom in" aria-label="Zoom in" className="map-tool rounded-full">
        <Plus className="w-4 h-4 stroke-[2] pointer-events-none" />
      </button>
    </div>

    <div className="absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] right-3.5 sm:right-5 z-[1000] flex flex-col items-end gap-2 pointer-events-auto">
      {/* Primary action: trip planner (stop or GPS -> buses to the destination) */}
      <button
        data-tour="trip"
        onClick={onToggleTrip}
        data-tip="Find your bus"
        aria-label="Find your bus"
        aria-pressed={isTripOpen}
        className={`btn-primary w-9 h-9 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:h-10 rounded-xl flex items-center justify-center cursor-pointer ${
          isTripOpen ? 'ring-2 ring-offset-2 ring-neutral-900/40 ring-offset-white dark:ring-white/50 dark:ring-offset-neutral-950' : ''
        }`}
      >
        <Navigation className="w-4 h-4 stroke-[2.2] pointer-events-none" />
      </button>

      {/* Map tools */}
      <div className="surface rounded-xl flex flex-col p-0.5" role="group" aria-label="Map tools">
        <button
          onClick={onToggleLegend}
          data-tip="Bus services & legend"
          aria-label="Toggle legend"
          aria-pressed={isLegendOpen}
          className="map-tool aria-pressed:bg-neutral-100 aria-pressed:text-neutral-950 dark:aria-pressed:bg-white/10 dark:aria-pressed:text-white"
        >
          <BookOpen className="w-4 h-4 stroke-[2] pointer-events-none" />
        </button>
        <button onClick={onOpenHelp} data-tip="How to use" aria-label="How to use this map" className="map-tool">
          <CircleHelp className="w-4 h-4 stroke-[2] pointer-events-none" />
        </button>
        <button
          onClick={shareCurrentView}
          data-tip={isLinkCopied ? 'Link copied' : 'Share link to this view'}
          aria-label="Share link to this view"
          className="map-tool"
        >
          {isLinkCopied ? (
            <Check className="w-4 h-4 stroke-[2.6] pointer-events-none text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Share2 className="w-4 h-4 stroke-[2] pointer-events-none" />
          )}
        </button>
        <OfflineButton hideInstallCard={isTripOpen || isHelpOpen} />
        <button
          onClick={onToggleTheme}
          data-tip={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="map-tool"
        >
          {isDark ? <Sun className="w-4 h-4 stroke-[2] pointer-events-none" /> : <Moon className="w-4 h-4 stroke-[2] pointer-events-none" />}
        </button>
        {/* Fullscreen: desktop only (phones lack the API or are already full screen as an installed app) */}
        {canFullscreen && (
          <div className="hidden sm:block">
            <button onClick={toggleFullscreen} data-tip={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label="Toggle fullscreen" className="map-tool">
              {isFullscreen ? <Minimize className="w-4 h-4 stroke-[2] pointer-events-none" /> : <Maximize className="w-4 h-4 stroke-[2] pointer-events-none" />}
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
