import { STATIONS, LINES } from './data/tripNetwork.js';
import { LANDMARKS } from './data/landmarks.js';

// Trip planning over the network built by scripts/build_trip_network.py.
// Stations carry real-world coordinates (OpenStreetMap matches, or interpolated), so GPS positions can be
// matched to the nearest stops; lines are station graphs, so routes that branch or loop still route correctly.

const WALK_M_PER_MIN = 75;
const RIDE_M_PER_MIN = 250; // ~15 km/h in Kathmandu traffic
const STOP_DWELL_MIN = 0.5;
const TRANSFER_PENALTY_MIN = 10;
const MAX_ORIGIN_WALK_M = 2500;
const TRANSFER_MAP_PX = 90; // stops drawn this close on the map are the same place (bundled lines)
const SAME_NAME_MAP_PX = 600; // the same label further apart is a different place (e.g. two "Bhaktapur Mini Bus Park")
const MAX_TRANSFER_WALK_M = 600;

export const stations = STATIONS.map(([name, x, y, lat, lon, exact], index) => ({ index, name, x, y, lat, lon, exact: exact === 1 }));

export const lines = LINES.map((line, index) => {
  const adj = new Map(line.stations.map((s) => [s, []]));
  for (const [a, b] of line.edges) {
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  // Ring road routes run in circles: their "terminus" says nothing about direction
  const isLoop = /ring ?road|circular|loop/i.test(line.name);
  return { ...line, index, adj, label: line.codes.join(' · '), isLoop };
});

const linesAtStation = stations.map(() => []);
for (const line of lines) for (const s of line.stations) linesAtStation[s].push(line.index);

const mapDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Stations you can change between on foot: drawn next to each other, or the same label nearby
const transferGroup = stations.map((st) =>
  stations
    .filter((o) => mapDistance(o, st) < TRANSFER_MAP_PX || (o.name === st.name && mapDistance(o, st) < SAME_NAME_MAP_PX))
    .map((o) => o.index)
);

// Buses stopping at a station (including stops drawn right next to it), ordered by route code
export function linesAtStop(station) {
  if (station.landmark) return linesAtStop(station.stop);
  const found = new Map();
  for (const s of transferGroup[station.index]) for (const li of linesAtStation[s]) found.set(li, lines[li]);
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371e3 * Math.asin(Math.sqrt(a));
}

export function nearestStations(lat, lon, count = 4) {
  const seen = new Set();
  return stations
    .map((st) => ({ station: st, walkM: distanceMeters(lat, lon, st.lat, st.lon) }))
    .sort((a, b) => a.walkM - b.walkM)
    .filter(({ station }) => (seen.has(station.name) ? false : seen.add(station.name)))
    .slice(0, count);
}

const normalize = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');

const matchScore = (text, q) => {
  const name = normalize(text);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.split(' ').some((w) => w.startsWith(q))) return 60;
  if (name.includes(q)) return 40;
  return -1;
};

/** Stops and landmarks matching a typed query, best first. */
export function searchStations(query, limit = 8) {
  const q = normalize(query.trim());
  if (!q) return [];
  const seen = new Set();
  const scored = [];
  for (const st of stations) {
    if (seen.has(st.name)) continue;
    const score = matchScore(st.name, q);
    if (score >= 0) {
      seen.add(st.name);
      scored.push({ st, score: score + linesAtStation[st.index].length * 0.5 });
    }
  }
  for (const lm of landmarks) {
    const score = Math.max(...[lm.name, ...lm.aliases].map((n) => matchScore(n, q)));
    if (score >= 0) scored.push({ st: lm, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.st);
}

// ---------------------------------------------------------------- GPS position on the schematic map ----------
const anchors = stations.filter((s) => s.exact);
const toMeters = (lat, lon) => [(lon - 85.3) * 111320 * Math.cos((27.7 * Math.PI) / 180), (lat - 27.7) * 110540];

// Weighted 2D affine fit (normal equations, one 3x3 system per output axis)
function fitAffine(src, dst, w) {
  const m = Array.from({ length: 3 }, () => [0, 0, 0]);
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  src.forEach(([x, y], i) => {
    const v = [x, y, 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) m[r][c] += w[i] * v[r] * v[c];
      bx[r] += w[i] * v[r] * dst[i][0];
      by[r] += w[i] * v[r] * dst[i][1];
    }
  });
  const solve = (b) => {
    const a = m.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
      [a[i], a[p]] = [a[p], a[i]];
      if (Math.abs(a[i][i]) < 1e-12) return null;
      for (let k = 0; k < 3; k++) {
        if (k === i) continue;
        const f = a[k][i] / a[i][i];
        for (let c = i; c < 4; c++) a[k][c] -= f * a[i][c];
      }
    }
    return a.map((row, i) => row[3] / row[i]);
  };
  const cx = solve(bx);
  const cy = solve(by);
  return cx && cy ? ([x, y]) => [cx[0] * x + cx[1] * y + cx[2], cy[0] * x + cy[1] * y + cy[2]] : null;
}

// Weighted rotation + scale + shift from map (src) to metres (dst), returned inverted (metres -> map).
// Stable when the points are nearly collinear. Metres y points north, map y points down, so y is flipped.
function fitSimilarityInverse(src, dst, w) {
  const sw = w.reduce((a, b) => a + b, 0);
  const mean = (pts) => [0, 1].map((k) => pts.reduce((acc, p, i) => acc + w[i] * p[k], 0) / sw);
  const ms = mean(src);
  const md = mean(dst);
  let re = 0;
  let im = 0;
  let norm = 0;
  src.forEach(([x, y], i) => {
    const zr = x - ms[0];
    const zi = -(y - ms[1]);
    const ur = dst[i][0] - md[0];
    const ui = dst[i][1] - md[1];
    // conj(z) * u
    re += w[i] * (zr * ur + zi * ui);
    im += w[i] * (zr * ui - zi * ur);
    norm += w[i] * (zr * zr + zi * zi);
  });
  const ar = re / norm;
  const ai = im / norm;
  // Inverse: metres -> map. z = (u - md) / a, then undo the y flip
  return ([ux, uy]) => {
    const dr = ux - md[0];
    const di = uy - md[1];
    const den = ar * ar + ai * ai;
    const zr = (dr * ar + di * ai) / den;
    const zi = (di * ar - dr * ai) / den;
    return [ms[0] + zr, ms[1] - zi];
  };
}

function isNearlyCollinear(pts, w) {
  const sw = w.reduce((a, b) => a + b, 0);
  const mx = pts.reduce((acc, p, i) => acc + w[i] * p[0], 0) / sw;
  const my = pts.reduce((acc, p, i) => acc + w[i] * p[1], 0) / sw;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  pts.forEach(([x, y], i) => {
    sxx += w[i] * (x - mx) ** 2;
    syy += w[i] * (y - my) ** 2;
    sxy += w[i] * (x - mx) * (y - my);
  });
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lo = tr / 2 - disc;
  const hi = tr / 2 + disc;
  return lo <= 0 || hi / lo > 25;
}

/**
 * Approximate position of a GPS fix on the schematic map: a local transform fitted to the nearest
 * OSM-matched stations. The map is schematic (distances are not to scale), so this is indicative only.
 */
export function geoToMap(lat, lon) {
  const p = toMeters(lat, lon);
  const near = anchors
    .map((a) => ({ a, m: toMeters(a.lat, a.lon) }))
    .map((e) => ({ ...e, d: Math.hypot(e.m[0] - p[0], e.m[1] - p[1]) }))
    .sort((u, v) => u.d - v.d)
    .slice(0, 8);
  const metres = near.map((e) => e.m);
  const mapXY = near.map((e) => [e.a.x, e.a.y]);
  const w = near.map((e) => 1 / (e.d + 150));
  // Affine where the anchors spread in 2D; nearly collinear anchors (stops along one road) would make it
  // extrapolate wildly sideways, so use a similarity transform there
  const transform = isNearlyCollinear(metres, w) ? fitSimilarityInverse(mapXY, metres, w) : fitAffine(metres, mapXY, w);
  const guess = transform ? transform(p) : null;
  const nearest = near[0].a;
  if (!guess || Math.hypot(guess[0] - nearest.x, guess[1] - nearest.y) > 1500) return { x: nearest.x, y: nearest.y };
  return { x: guess[0], y: guess[1] };
}

// ---------------------------------------------------------------- Landmarks ------------------------------------
// Places no bus passes (src/data/landmarks.js), reached on foot from their stop. They work like a stop in search and
// as a trip's start or end: the trip plans from / to the stop and adds the walk. `index` is a string, so it can key
// lists but never indexes the network.
export const landmarks = LANDMARKS.flatMap((lm, i) => {
  const stop = stations.find((st) => st.name === lm.stop);
  if (!stop) return [];
  return [{ ...lm, index: `landmark-${i}`, landmark: true, stop, walkM: distanceMeters(lm.lat, lm.lon, stop.lat, stop.lon), ...geoToMap(lm.lat, lm.lon) }];
});

/** A stop or landmark by its exact name (shared links, history), or null. */
export const stopByName = (name) => {
  const n = name.toLowerCase();
  return stations.find((st) => st.name.toLowerCase() === n) || landmarks.find((lm) => lm.name.toLowerCase() === n) || null;
};

/** Trip origins for a picked stop or landmark (a landmark starts with the walk to its stop). */
export const originsFor = (place) => [place.landmark ? { station: place.stop, walkM: place.walkM } : { station: place, walkM: 0 }];

// ---------------------------------------------------------------- Routing --------------------------------------
// Dijkstra over states "at station s, off the bus" and "at station s, on line L". Riding costs time by
// distance, boarding costs a transfer penalty (refunded once, for the first bus), and nearby stations are
// connected on foot, so trips with any number of changes are found.

class MinHeap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(cost, value) {
    const a = this.items;
    a.push([cost, value]);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const stationDistance = (a, b) => distanceMeters(stations[a].lat, stations[a].lon, stations[b].lat, stations[b].lon);
const walkMeters = (a, b) => Math.min(stationDistance(a, b), MAX_TRANSFER_WALK_M);

// State key: station * SLOTS + slot, where slot 0 = off the bus and slot L + 1 = on line L
const SLOTS = lines.length + 1;

function search(origins, destCosts, bannedLines) {
  const best = new Map();
  const prev = new Map();
  const heap = new MinHeap();
  const relax = (fromKey, key, cost) => {
    if (cost < (best.get(key) ?? Infinity)) {
      best.set(key, cost);
      prev.set(key, fromKey);
      heap.push(cost, key);
    }
  };
  for (const { station, walkM } of origins) relax(null, station.index * SLOTS, walkM / WALK_M_PER_MIN);

  let goal = null;
  let goalCost = Infinity;
  while (heap.size > 0) {
    const [cost, key] = heap.pop();
    if (cost > best.get(key) || cost >= goalCost) continue;
    const s = Math.floor(key / SLOTS);
    const slot = key % SLOTS;
    if (slot === 0) {
      if (destCosts.has(s) && cost + destCosts.get(s) < goalCost) {
        goalCost = cost + destCosts.get(s);
        goal = key;
      }
      for (const li of linesAtStation[s]) if (!bannedLines.has(li)) relax(key, s * SLOTS + li + 1, cost + TRANSFER_PENALTY_MIN);
      for (const t of transferGroup[s]) if (t !== s) relax(key, t * SLOTS, cost + 1 + walkMeters(s, t) / WALK_M_PER_MIN);
    } else {
      relax(key, s * SLOTS, cost); // get off
      for (const t of lines[slot - 1].adj.get(s)) relax(key, t * SLOTS + slot, cost + stationDistance(s, t) / RIDE_M_PER_MIN + STOP_DWELL_MIN);
    }
  }
  if (goal === null) return null;
  const states = [];
  for (let k = goal; k !== null; k = prev.get(k)) states.unshift(k);
  return { states, minutes: goalCost - TRANSFER_PENALTY_MIN };
}

// Terminus in the direction of travel: the furthest station reached through `to` when coming from `from`
function directionOf(line, from, to) {
  const depth = new Map([[from, 0]]);
  const parent = new Map([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const v of line.adj.get(queue[i])) {
      if (!depth.has(v)) {
        depth.set(v, depth.get(queue[i]) + 1);
        parent.set(v, queue[i]);
        queue.push(v);
      }
    }
  }
  let best = to;
  for (const [s, d] of depth) {
    if (d <= depth.get(best)) continue;
    let k = s;
    while (k !== null && k !== to) k = parent.get(k);
    if (k === to) best = s;
  }
  return stations[best];
}

// Named ends of a route, from its name: "Route S7: Lagankhel – Budhanilkantha" -> Lagankhel, Budhanilkantha
const terminiCache = new Map();
function terminiOf(line) {
  if (!terminiCache.has(line.index)) {
    const parts = (line.name.split(':')[1] || '').split(/\s+[–-]\s+/).map((p) => p.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
    const termini =
      parts.length >= 2
        ? [parts[0], parts[parts.length - 1]].map((label) => ({
            label,
            // "Lubhu / Lamatar": either name locates the end
            station: label.split('/').map((n) => searchStations(n, 1)[0]).find(Boolean) || null,
          }))
        : [];
    terminiCache.set(line.index, termini);
  }
  return terminiCache.get(line.index);
}

// Destination sign to look for: the named end of the route the ride is heading to. Falls back to the far
// end of the line graph when the route name has no usable ends.
function headingTowards(line, from, to) {
  const termini = terminiOf(line);
  const approach = (t) => (t.station ? stationDistance(from, t.station.index) - stationDistance(to, t.station.index) : null);
  if (termini.length === 2) {
    const [a, b] = termini.map(approach);
    if (a !== null && b !== null) return (a >= b ? termini[0] : termini[1]).label;
    if (a !== null) return (a > 0 ? termini[0] : termini[1]).label;
    if (b !== null) return (b > 0 ? termini[1] : termini[0]).label;
  }
  return directionOf(line, from, to).name;
}

function toTrip({ states, minutes }, origins, destination) {
  const rides = [];
  let current = null;
  for (const key of states) {
    const s = Math.floor(key / SLOTS);
    const slot = key % SLOTS;
    if (slot === 0) {
      current = null;
    } else if (!current) {
      current = { line: lines[slot - 1], path: [s] };
      rides.push(current);
    } else {
      current.path.push(s);
    }
  }
  const legs = rides
    .filter((r) => r.path.length > 1)
    .map(({ line, path }) => {
      let rideM = 0;
      for (let i = 1; i < path.length; i++) rideM += stationDistance(path[i - 1], path[i]);
      return {
        line,
        from: stations[path[0]],
        to: stations[path[path.length - 1]],
        stops: path.length - 1,
        path: path.map((s) => stations[s]),
        rideM,
        // On a loop the far end says nothing about direction, so name the next stop instead
        towards: line.isLoop ? null : headingTowards(line, path[0], path[path.length - 1]),
        via: line.isLoop ? stations[path[1]] : null,
      };
    });
  const firstStation = Math.floor(states[0] / SLOTS);
  const last = legs[legs.length - 1];
  return {
    legs,
    walkM: origins.find((o) => o.station.index === firstStation)?.walkM ?? 0,
    finalWalkM: last && last.to.name !== destination.name ? distanceMeters(last.to.lat, last.to.lon, destination.lat, destination.lon) : 0,
    minutes,
  };
}

/**
 * Plan trips from origin candidates ([{ station, walkM }]) to a destination stop or landmark.
 * Returns up to `limit` distinct options, fastest first. Each further search bans the main line of the
 * options found so far, so alternatives use different buses.
 */
export function planTrips(origins, destination, limit = 4) {
  const usable = origins.filter((o) => o.walkM <= MAX_ORIGIN_WALK_M);
  const from = usable.length > 0 ? usable : origins.slice(0, 1);

  // Any stop with the destination's name, or drawn right next to it, will do. A landmark: its stop, plus the walk.
  const target = destination.landmark ? destination.stop : destination;
  const extraMin = destination.landmark ? destination.walkM / WALK_M_PER_MIN : 0;
  const destCosts = new Map();
  for (const st of stations) {
    if (st.name === target.name) destCosts.set(st.index, extraMin);
    else if (mapDistance(st, target) < TRANSFER_MAP_PX) destCosts.set(st.index, extraMin + walkMeters(st.index, target.index) / WALK_M_PER_MIN);
  }

  const trips = [];
  const banned = new Set();
  const seen = new Set();
  for (let attempt = 0; attempt < limit * 2 && trips.length < limit; attempt++) {
    const result = search(from, destCosts, banned);
    if (!result) break;
    const trip = toTrip(result, from, destination);
    if (trip.legs.length === 0) break; // already at the destination
    banned.add(trip.legs.reduce((a, b) => (b.stops > a.stops ? b : a)).line.index);
    const key = trip.legs.map((l) => l.line.svgId).join('>');
    if (seen.has(key)) continue;
    seen.add(key);
    trips.push(trip);
  }
  return trips.sort((a, b) => a.minutes - b.minutes);
}
