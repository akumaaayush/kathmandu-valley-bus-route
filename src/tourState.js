// Help tour state, kept out of HelpTour.jsx so the tour itself can load on demand. The tour opens by itself on a
// first plain visit (not from a shared link) and again from the ? button. Seen-state lives in localStorage; bump the
// key's version to show the tour once more after a big feature lands.

const SEEN_KEY = 'ktm_tour_v1';

export const isTourSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === 'done';
  } catch {
    return false;
  }
};

export const markTourSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, 'done');
  } catch {}
};

// "Show me": ring the real control for a few seconds. Targets are the data-tour attributes in the app.
const PULSE_MS = 2800;
export function pulseTarget(name) {
  // After the tour closes (and e.g. the search bar mounts again)
  setTimeout(() => {
    const el = document.querySelector(`[data-tour="${name}"]`);
    if (!el) return;
    el.classList.remove('tour-pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('tour-pulse');
    setTimeout(() => el.classList.remove('tour-pulse'), PULSE_MS);
  }, 80);
}
