import { useEffect, useState } from 'react';

// The trip planner and its stop network (~90 KB) load on first use, shared by the stop search and trip panel
let plannerPromise = null;
export const loadPlanner = () => (plannerPromise ??= import('./tripPlanner'));

// Line shapes (~35 KB) for "which bus is this line?" taps, loaded on the first tap
let lineFinderPromise = null;
export const loadLineFinder = () => (lineFinderPromise ??= import('./lineFinder'));

export function usePlanner(enabled = true) {
  const [planner, setPlanner] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadPlanner().then((mod) => !cancelled && setPlanner(mod));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return planner;
}

// Components loaded the first time they are wanted, then kept (so their state survives closing)
export const loadLegend = () => import('./components/LegendModal');
export const loadHelpTour = () => import('./components/HelpTour');

/**
 * The component from `load` once `wanted` first turns true, null until then. A failed load (offline before the
 * service worker cached it) calls onError. Browsers keep a failed import failed until the page reloads, so a caller
 * that needs the component should offer a reload (the URL keeps the view).
 */
export function useLazyComponent(load, wanted, onError) {
  const [Component, setComponent] = useState(null);
  useEffect(() => {
    if (!wanted || Component) return;
    let cancelled = false;
    load()
      .then((mod) => !cancelled && setComponent(() => mod.default))
      .catch(() => !cancelled && onError?.());
    return () => {
      cancelled = true;
    };
  }, [wanted, Component]);
  return Component;
}
