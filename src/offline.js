import { useCallback, useEffect, useRef, useState } from 'react';

// Service worker + "Save map offline" support.
// The service worker (built from src/service-worker.js) caches the app shell and every tile the user views.
// downloadAllTiles() fills the same tile cache with the full pyramid so the whole map works without data.

const DOWNLOAD_CONCURRENCY = 6;
const FETCH_RETRIES = 2;

// Installed PWAs can stay open for days, so look for a new deploy whenever the app comes back to the foreground
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

const updateListeners = new Set();
let waitingWorker = null;

const setWaitingWorker = (worker) => {
  waitingWorker = worker;
  updateListeners.forEach((listener) => listener(worker));
};

// A new version installed while an older one controls the page: it waits until the user applies it
const watchForUpdate = (registration) => {
  if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(worker);
    });
  });
};

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      if (!registration) return;
      watchForUpdate(registration);
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
        lastCheck = Date.now();
        registration.update().catch(() => {});
      });
    } catch (err) {
      console.error('Service worker registration failed:', err);
    }
  });
}

/** updateReady: a new deploy is downloaded and waiting. applyUpdate() switches to it and reloads. */
export function useAppUpdate() {
  const [worker, setWorker] = useState(() => waitingWorker);

  useEffect(() => {
    updateListeners.add(setWorker);
    return () => updateListeners.delete(setWorker);
  }, []);

  const applyUpdate = useCallback(() => {
    if (!worker) return;
    let reloading = false;
    const reload = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    worker.postMessage('SKIP_WAITING');
    // If the waiting worker was replaced or failed, controllerchange never fires: reload anyway
    setTimeout(reload, 3000);
  }, [worker]);

  return { updateReady: worker !== null, applyUpdate };
}

const tileUrl = (path) => new URL(path, document.baseURI).href;

async function fetchTilesManifest() {
  const res = await fetch('./tiles-manifest.json');
  if (!res.ok) throw new Error(`HTTP error ${res.status}`);
  return res.json();
}

async function countCachedTiles(manifest) {
  const cache = await caches.open(manifest.cacheName);
  const cachedUrls = new Set((await cache.keys()).map((req) => req.url));
  return manifest.tiles.filter((path) => cachedUrls.has(tileUrl(path))).length;
}

async function fetchTile(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      throw new Error(`HTTP error ${res.status}`);
    } catch (err) {
      if (attempt >= FETCH_RETRIES) throw err;
    }
  }
}

// Downloads every tile not yet cached. Resumable: already-cached tiles are skipped.
async function downloadAllTiles(manifest, onProgress) {
  const cache = await caches.open(manifest.cacheName);
  const cachedUrls = new Set((await cache.keys()).map((req) => req.url));
  const urls = manifest.tiles.map(tileUrl);
  const total = urls.length;
  let done = urls.filter((url) => cachedUrls.has(url)).length;
  let failed = 0;
  const queue = urls.filter((url) => !cachedUrls.has(url));

  onProgress(done / total);

  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.pop();
      try {
        await cache.put(url, await fetchTile(url));
      } catch {
        failed++;
      }
      done++;
      onProgress(done / total);
    }
  };
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));

  if (failed > 0) throw new Error(`${failed} of ${total} map tiles failed to download`);
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * PWA install state. canInstall: browser offered an install prompt (Chrome/Edge/Android).
 * showIOSHint: iOS Safari has no prompt, so the UI explains "Add to Home Screen" instead.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandalone);

  useEffect(() => {
    const handlePrompt = (e) => {
      e.preventDefault();
      setPromptEvent(e);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => {});
    setPromptEvent(null);
  }, [promptEvent]);

  return {
    canInstall: !isInstalled && promptEvent !== null,
    showIOSHint: !isInstalled && isIOS(),
    install,
  };
}

/**
 * Offline map state for the UI.
 * status: 'unsupported' | 'checking' | 'idle' | 'downloading' | 'ready' | 'error'
 */
export function useOfflineMap() {
  const [status, setStatus] = useState('checking');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const manifestRef = useRef(null);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!('caches' in window)) {
      setStatus('unsupported');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const manifest = await fetchTilesManifest();
        const cached = await countCachedTiles(manifest);
        if (cancelled) return;
        manifestRef.current = manifest;
        setTotalBytes(manifest.totalBytes);
        setProgress(cached / manifest.tiles.length);
        setStatus(cached >= manifest.tiles.length ? 'ready' : 'idle');
      } catch {
        if (!cancelled) setStatus('unsupported');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const download = useCallback(async () => {
    const manifest = manifestRef.current;
    if (!manifest) return;
    setStatus('downloading');
    setError(null);
    try {
      // Ask the browser not to evict the saved map under storage pressure
      await navigator.storage?.persist?.().catch(() => {});
      await downloadAllTiles(manifest, setProgress);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, []);

  return { status, progress, error, totalBytes, isOnline, download };
}
