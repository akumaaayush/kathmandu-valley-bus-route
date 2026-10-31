import { BUS_SERVICES } from './data/legendData';
import { getOperatorRoutes } from './data/dedicatedRoutesData';
import { getPlaceCoordinates } from './data/placesData';

// Shareable links: the selected operator, route branches and pinned place live in the URL query,
// e.g. ?op=S&r=S1,S2&p=Lagankhel. An open trip plan adds ?from=Jawalakhel&to=Ratnapark&opt=2 (stop names,
// opt = 1-based option when not the first). A trip planned from GPS shares the boarding stop, never coordinates.
// The "lines here" card shares the spot (map canvas x,y, a stop's own position at a stop) and its lines by route
// code: ?at=5832,4120&l=S2,S5,B4&sel=S2. Codes survive regenerating the trip network; svg ids and indexes may not.

const SHARE_KEYS = ['op', 'r', 'p', 'from', 'to', 'opt', 'at', 'l', 'sel'];

const codeList = (value) => [...new Set((value || '').split(',').map((code) => code.trim().toUpperCase()).filter(Boolean))];

// Reads the URL and returns only the parts that match known data
export function readShareLink(search = window.location.search) {
  const params = new URLSearchParams(search);

  const opCode = params.get('op');
  const service = opCode ? BUS_SERVICES.find((s) => s.code === opCode.toUpperCase()) || null : null;

  const branchCodes = service ? getOperatorRoutes(service.name).map((sr) => sr.code) : [];
  const subRouteCodes = (params.get('r') || '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => branchCodes.includes(code));

  const placeName = params.get('p');
  const place = placeName ? getPlaceCoordinates(placeName) : null;

  // Stop names are checked against the stop network when the trip planner loads
  const from = params.get('from')?.trim() || null;
  const to = params.get('to')?.trim() || null;
  const opt = Number.parseInt(params.get('opt'), 10);
  const trip = from || to ? { from, to, option: Number.isFinite(opt) && opt > 1 ? opt - 1 : 0 } : null;

  // Line codes are checked against the stop network when it loads
  const [x, y] = (params.get('at') || '').split(',').map(Number);
  const codes = codeList(params.get('l'));
  const spot = Number.isFinite(x) && Number.isFinite(y) && codes.length > 0
    ? { x, y, codes, selected: codeList(params.get('sel')).filter((code) => codes.includes(code)) }
    : null;

  return { service, subRouteCodes: [...new Set(subRouteCodes)], place, trip, spot };
}

export function buildShareUrl({ service, subRouteCodes, place, trip, spot }) {
  const url = new URL(window.location.href);
  for (const key of SHARE_KEYS) url.searchParams.delete(key);
  if (service) url.searchParams.set('op', service.code);
  if (service && subRouteCodes.length > 0) url.searchParams.set('r', subRouteCodes.join(','));
  if (place) url.searchParams.set('p', place.name);
  if (trip?.from) url.searchParams.set('from', trip.from);
  if (trip?.to) url.searchParams.set('to', trip.to);
  if (trip?.from && trip?.to && trip.option > 0) url.searchParams.set('opt', String(trip.option + 1));
  if (spot) {
    url.searchParams.set('at', `${Math.round(spot.x)},${Math.round(spot.y)}`);
    url.searchParams.set('l', spot.codes.join(','));
    if (spot.selected.length > 0) url.searchParams.set('sel', spot.selected.join(','));
  }
  // Keep commas readable in the link
  return url.toString().replace(/%2C/g, ',');
}

export function writeShareLink(state) {
  const next = buildShareUrl(state);
  if (next !== window.location.href) window.history.replaceState(null, '', next);
}

// Phones get the native share sheet; elsewhere the link is copied. Resolves to 'shared' | 'copied' | 'prompted'.
export async function shareLink(url = window.location.href, title = document.title) {
  const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches;
  if (navigator.share && isTouchDevice) {
    await navigator.share({ title, url }).catch(() => {});
    return 'shared';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    window.prompt('Copy this link:', url);
    return 'prompted';
  }
}
