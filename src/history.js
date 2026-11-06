import { useEffect, useReducer } from 'react';

// Recent stops and trips, kept on this device only (localStorage). Stored by stop name and matched against the
// current stop network when read: a stop renamed or dropped by a data update just disappears, and anything else
// in storage (edited by hand, another version of the app) is ignored rather than trusted.

const KEY = 'ktm_history_v1';
const MAX_STOPS = 6;
const MAX_TRIPS = 5;
const MAX_NAME = 120;

const isName = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME;

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return {
      stops: (Array.isArray(data?.stops) ? data.stops : []).filter(isName).slice(0, MAX_STOPS),
      trips: (Array.isArray(data?.trips) ? data.trips : []).filter((t) => isName(t?.from) && isName(t?.to)).slice(0, MAX_TRIPS),
    };
  } catch {
    return { stops: [], trips: [] };
  }
}

const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
  notify();
}

// Another tab changed it
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => e.key === KEY && notify());

const pushStop = (stops, name) => [name, ...stops.filter((s) => s !== name)].slice(0, MAX_STOPS);

export function addRecentStop(name) {
  if (!isName(name)) return;
  const data = read();
  if (data.stops[0] === name) return;
  write({ ...data, stops: pushStop(data.stops, name) });
}

export function addRecentTrip(from, to) {
  if (!isName(from) || !isName(to) || from === to) return;
  const data = read();
  if (data.trips[0]?.from === from && data.trips[0]?.to === to) return;
  write({
    stops: pushStop(pushStop(data.stops, from), to),
    trips: [{ from, to }, ...data.trips.filter((t) => t.from !== from || t.to !== to)].slice(0, MAX_TRIPS),
  });
}

export const clearHistory = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  notify();
};

// Station lookup by name, built once per stop network
const indexes = new WeakMap();
function stationByName(stations, name) {
  let index = indexes.get(stations);
  if (!index) {
    index = new Map();
    for (const st of stations) if (!index.has(st.name)) index.set(st.name, st);
    indexes.set(stations, index);
  }
  return index.get(name) ?? null;
}

/** Recent stops and trips as station objects (newest first), once the stop network (`planner`) has loaded. */
export function useHistory(planner) {
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => listeners.delete(rerender);
  }, []);
  if (!planner) return { stops: [], trips: [] };
  const { stops, trips } = read();
  const at = (name) => stationByName(planner.stations, name) ?? planner.landmarks.find((lm) => lm.name === name) ?? null;
  return {
    stops: stops.map(at).filter(Boolean),
    trips: trips.map((t) => ({ from: at(t.from), to: at(t.to) })).filter((t) => t.from && t.to),
  };
}
