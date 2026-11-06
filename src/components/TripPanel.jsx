import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, LocateFixed, MapPin, Search, Footprints, Bus, ArrowRight, ArrowUpDown, RefreshCw, LoaderCircle, ChevronDown, ChevronUp, History } from 'lucide-react';
import { usePlanner } from '../usePlanner';
import { addRecentStop, addRecentTrip, clearHistory, useHistory } from '../history';

// Trip planner: a chosen stop (or, on request, GPS -> nearest stops) -> buses to the destination, with changes if
// needed. Location is only requested when the user taps the location button.

const RECOMPUTE_AFTER_MOVE_M = 40;

const formatDistance = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
const formatMinutes = (min) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`);

// status: 'locating' | 'ok' | 'denied' | 'unavailable'
function useGeolocation(enabled) {
  const [state, setState] = useState({ status: 'locating', position: null });
  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setState({ status: 'unavailable', position: null });
      return;
    }
    setState((s) => ({ ...s, status: s.position ? 'ok' : 'locating' }));
    const id = navigator.geolocation.watchPosition(
      (pos) => setState({ status: 'ok', position: { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy } }),
      (err) => setState((s) => ({ status: err.code === err.PERMISSION_DENIED ? 'denied' : s.position ? 'ok' : 'unavailable', position: s.position })),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
  return state;
}

// The on-screen keyboard shrinks the visual viewport but not the layout one, so a bottom sheet ends up under it.
// Returns the visible area ({ top, height }) while a keyboard is open, else null.
const KEYBOARD_MIN_PX = 120;
function useKeyboardViewport() {
  const [viewport, setViewport] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setViewport((prev) => {
        if (window.innerHeight - vv.height < KEYBOARD_MIN_PX) return null;
        const next = { top: Math.round(vv.offsetTop), height: Math.round(vv.height) };
        return prev && prev.top === next.top && prev.height === next.height ? prev : next;
      });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return viewport;
}

// action: optional button shown inside the input (e.g. "use my location")
// recent: recent stops, listed while the field is focused and empty (not on autofocus: only once the user picks it)
function StopSearch({ planner, placeholder, onSelect, autoFocus, action, recent = [] }) {
  const [query, setQuery] = useState('');
  const [showRecent, setShowRecent] = useState(false);
  const skipFocus = useRef(Boolean(autoFocus));
  const results = planner && query.trim() ? planner.searchStations(query) : [];
  const recentShown = showRecent && !query.trim() ? recent.slice(0, 5) : [];
  const select = (st) => {
    setQuery('');
    setShowRecent(false);
    onSelect(st);
  };
  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-neutral-100 dark:bg-white/[0.06] focus-within:ring-2 focus-within:ring-neutral-900/10 dark:focus-within:ring-white/15">
        <Search className="w-4 h-4 text-neutral-500 shrink-0" />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (!skipFocus.current) setShowRecent(true);
            skipFocus.current = false;
          }}
          onPointerDown={() => setShowRecent(true)}
          onBlur={() => setShowRecent(false)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none"
        />
        {action}
      </div>
      {results.length > 0 && (
        <ul className="surface sm:absolute left-0 right-0 mt-1 z-10 max-h-60 overflow-y-auto overscroll-contain rounded-xl divide-y divide-neutral-100 dark:divide-white/10">
          {results.map((st) => (
            <li key={st.index}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(st)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span className="truncate">{st.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {recentShown.length > 0 && (
        <div className="surface sm:absolute left-0 right-0 mt-1 z-10 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Recent stops</span>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearHistory}
              className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/10">
            {recentShown.map((st) => (
              <li key={st.index}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(st)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{st.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {planner && query.trim() && results.length === 0 && (
        <p className="mt-1 px-1 text-xs text-neutral-500">No stop on the map matches "{query}".</p>
      )}
    </div>
  );
}

function LineBadge({ line }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-bold text-white shrink-0"
      style={{ backgroundColor: line.color }}
      data-tip={line.operator}
    >
      {line.label}
    </span>
  );
}

function TripSteps({ trip, origin, destination, fromGps }) {
  return (
    <ol className="mt-2.5 space-y-2.5 text-xs text-neutral-600 dark:text-neutral-300">
      {(fromGps || origin?.landmark) && trip.walkM > 30 && (
        <li className="flex gap-2">
          <Footprints className="w-4 h-4 text-neutral-500 shrink-0" />
          <span>
            Walk ~{formatDistance(trip.walkM)}{origin?.landmark && !fromGps ? ` from ${origin.name}` : ''} to{' '}
            <b className="text-neutral-900 dark:text-white">{trip.legs[0].from.name}</b>
          </span>
        </li>
      )}
      {trip.legs.map((leg, i) => {
        const prev = trip.legs[i - 1];
        return (
          <React.Fragment key={i}>
            {prev && prev.to.index !== leg.from.index && (
              <li className="flex gap-2">
                <Footprints className="w-4 h-4 text-neutral-500 shrink-0" />
                <span>
                  Walk from {prev.to.name} to <b className="text-neutral-900 dark:text-white">{leg.from.name}</b>
                </span>
              </li>
            )}
            <li className="flex gap-2">
              {i === 0 ? <Bus className="w-4 h-4 shrink-0" style={{ color: leg.line.color }} /> : <RefreshCw className="w-4 h-4 text-amber-500 shrink-0" />}
              <div className="min-w-0">
                <div>
                  {i === 0 ? 'Board' : 'Change to'} <LineBadge line={leg.line} /> <span className="font-medium">{leg.line.operator}</span> at{' '}
                  <b className="text-neutral-900 dark:text-white">{leg.from.name}</b>
                </div>
                <div className="text-neutral-500 dark:text-neutral-400">
                  {leg.towards ? `Bus towards ${leg.towards}` : `Ring road bus, via ${leg.via.name}`} · {leg.stops} stop{leg.stops === 1 ? '' : 's'} ·
                  ~{formatDistance(leg.rideM)}
                </div>
                <details className="mt-0.5">
                  <summary className="cursor-pointer text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-200 select-none">Stops on the way</summary>
                  <p className="mt-1 leading-relaxed">{leg.path.map((s) => s.name).join(' → ')}</p>
                </details>
                <div className="mt-0.5">
                  Get off at <b className="text-rose-600 dark:text-rose-400">{leg.to.name}</b>
                </div>
              </div>
            </li>
          </React.Fragment>
        );
      })}
      {trip.finalWalkM > 30 && (
        <li className="flex gap-2">
          <Footprints className="w-4 h-4 text-neutral-500 shrink-0" />
          <span>
            Walk ~{formatDistance(trip.finalWalkM)} to <b className="text-neutral-900 dark:text-white">{destination.name}</b>
          </span>
        </li>
      )}
    </ol>
  );
}

// initialOrigin / initialDestination: station objects, or stop names from a shared link
export default function TripPanel({
  mapControlsRef,
  onClose,
  onShareStateChange,
  initialOrigin = null,
  initialDestination = null,
  initialOption = 0,
  pick = null, // { kind: 'origin' | 'destination', station, key }: a stop tapped on the map
}) {
  const planner = usePlanner();
  const [useGps, setUseGps] = useState(false);
  const [originStop, setOriginStop] = useState(typeof initialOrigin === 'string' ? null : initialOrigin);
  const [destination, setDestination] = useState(typeof initialDestination === 'string' ? null : initialDestination);
  const pendingOption = useRef(initialOption);
  const history = useHistory(planner);
  const pickOrigin = (st) => {
    addRecentStop(st.name);
    setOriginStop(st);
  };
  const pickDestination = (st) => {
    addRecentStop(st.name);
    setDestination(st);
  };

  // Stops tapped on the map fill From / To. Only picks made while this panel is open count.
  const seenPickKey = useRef(pick?.key);
  useEffect(() => {
    if (!pick || pick.key === seenPickKey.current) return;
    seenPickKey.current = pick.key;
    if (pick.kind === 'origin') {
      setUseGps(false);
      setOriginStop(pick.station);
    } else {
      setDestination(pick.station);
    }
  }, [pick]);

  // Stop names from a shared link resolve once the stop network has loaded; unknown names are ignored
  useEffect(() => {
    if (!planner) return;
    const byName = planner.stopByName;
    if (typeof initialOrigin === 'string') setOriginStop(byName(initialOrigin));
    if (typeof initialDestination === 'string') setDestination(byName(initialDestination));
  }, [planner, initialOrigin, initialDestination]);
  const [selected, setSelected] = useState(0);
  // Phones: the panel is a bottom sheet that can shrink to a summary to uncover the map
  const [collapsed, setCollapsed] = useState(false);
  // Focus the first empty field on desktop only: on phones it would pop the keyboard over the map
  const [isWideScreen] = useState(() => window.matchMedia?.('(min-width: 640px)').matches);
  // Phones: while typing a stop, the sheet fills the space above the keyboard so the results stay visible
  const keyboard = useKeyboardViewport();
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);
  const keyboardSheet = !isWideScreen && isTyping && keyboard;

  // Bring the field being typed in to the top of the sheet, leaving the rest of the space for its results
  const isKeyboardSheet = Boolean(keyboardSheet);
  useEffect(() => {
    const box = scrollRef.current;
    const input = document.activeElement;
    if (!isKeyboardSheet || !box || !box.contains(input)) return;
    box.scrollTop += input.getBoundingClientRect().top - box.getBoundingClientRect().top - 32;
  }, [isKeyboardSheet]);
  const geo = useGeolocation(useGps);
  const lastPlannedPosition = useRef(null);
  const [plannedPosition, setPlannedPosition] = useState(null);

  // Re-plan only after a real move, so GPS jitter does not reshuffle the results
  useEffect(() => {
    if (!planner || !geo.position) return;
    const last = lastPlannedPosition.current;
    if (!last || planner.distanceMeters(last.lat, last.lon, geo.position.lat, geo.position.lon) > RECOMPUTE_AFTER_MOVE_M) {
      lastPlannedPosition.current = geo.position;
      setPlannedPosition(geo.position);
    }
  }, [planner, geo.position]);

  const origins = useMemo(() => {
    if (!planner) return [];
    if (!useGps) return originStop ? planner.originsFor(originStop) : [];
    return plannedPosition ? planner.nearestStations(plannedPosition.lat, plannedPosition.lon) : [];
  }, [planner, useGps, originStop, plannedPosition]);

  const nearest = useGps ? origins[0] : null;
  const isOutsideNetwork = nearest && nearest.walkM > 5000;

  const trips = useMemo(() => {
    if (!planner || !destination || origins.length === 0 || isOutsideNetwork) return null;
    return planner.planTrips(origins, destination);
  }, [planner, origins, destination, isOutsideNetwork]);

  // Swap From and To (the trip back). From "my location", the nearest stop becomes the destination.
  const swapFrom = useGps ? nearest?.station ?? null : originStop;
  const canSwap = Boolean(swapFrom || destination);
  const swapStops = () => {
    setUseGps(false);
    setOriginStop(destination);
    setDestination(swapFrom);
  };

  // Remember trips that found buses (from GPS, just the destination: a position is not a reusable start)
  useEffect(() => {
    if (!trips?.length || !destination) return;
    if (useGps) addRecentStop(destination.name);
    else if (originStop) addRecentTrip(originStop.name, destination.name);
  }, [trips]);

  // Same place, or starting at the stop of a landmark destination (then it is a walk, not a bus trip)
  const destStopName = destination?.landmark ? destination.stop.name : destination?.name;
  const alreadyThere =
    destination && (originStop?.name === destination.name || origins.some((o) => o.station.name === destStopName && o.walkM < 300));

  // A shared link may pick an option; any later re-plan starts at the first one
  useEffect(() => {
    if (!trips) {
      setSelected(0);
      return;
    }
    const wanted = pendingOption.current;
    pendingOption.current = 0;
    setSelected(wanted < trips.length ? wanted : 0);
  }, [trips]);

  // Map: user dot (approximate on the schematic map)
  useEffect(() => {
    const controls = mapControlsRef.current;
    if (!planner || !controls) return;
    controls.setUserLocation(useGps && geo.position ? planner.geoToMap(geo.position.lat, geo.position.lon) : null);
  }, [planner, useGps, geo.position, mapControlsRef]);

  // Map: highlight the selected trip's buses and mark where to board, change and get off
  const trip = trips?.[selected];

  // Report the trip for the share link. From GPS, share the boarding stop rather than the position. Until the
  // planner loads, keep the stop names from the incoming link so the URL does not lose them.
  const loadingFromLink = !planner;
  const shareFrom = loadingFromLink && typeof initialOrigin === 'string'
    ? initialOrigin
    : useGps ? trip?.legs[0].from.name ?? nearest?.station.name : originStop?.name;
  const shareTo = loadingFromLink && typeof initialDestination === 'string' ? initialDestination : destination?.name;
  const shareOption = trip ? selected : loadingFromLink ? initialOption : 0;
  useEffect(() => {
    onShareStateChange?.({ from: shareFrom ?? null, to: shareTo ?? null, option: shareOption });
  }, [shareFrom, shareTo, shareOption, onShareStateChange]);
  useEffect(() => {
    const controls = mapControlsRef.current;
    if (!controls) return;
    if (!trip) {
      controls.setTripMarkers([]);
      controls.clearRouteHighlight();
      if (planner && nearest && !destination) {
        controls.setTripMarkers([{ ...nearest.station, kind: 'board', title: nearest.station.name, subtitle: `Nearest stop · ~${formatDistance(nearest.walkM)}` }]);
      }
      return;
    }
    const markers = trip.legs.map((leg, i) => ({
      x: leg.from.x,
      y: leg.from.y,
      kind: i === 0 ? 'board' : 'change',
      title: leg.from.name,
      subtitle: `${i === 0 ? 'Board' : 'Change to'} ${leg.line.label}`,
    }));
    const last = trip.legs[trip.legs.length - 1];
    markers.push({ x: last.to.x, y: last.to.y, kind: 'alight', title: last.to.name, subtitle: 'Get off here' });
    // Landmarks no bus passes: pin the place itself and the walk
    if (!useGps && originStop?.landmark) markers.push({ x: originStop.x, y: originStop.y, kind: 'board', title: originStop.name, subtitle: `Walk ~${formatDistance(trip.walkM)} to ${trip.legs[0].from.name}` });
    if (destination.landmark) markers.push({ x: destination.x, y: destination.y, kind: 'alight', title: destination.name, subtitle: `Walk ~${formatDistance(trip.finalWalkM)} from ${last.to.name}` });
    controls.highlightRoute('Trip', trip.legs.map((l) => l.line.svgId));
    controls.setTripMarkers(markers);

    const points = trip.legs.flatMap((l) => l.path);
    if (useGps && geo.position) points.push(planner.geoToMap(geo.position.lat, geo.position.lon));
    const isWide = window.innerWidth >= 640;
    const sheetHeight = collapsed ? 150 : window.innerHeight * 0.58;
    controls.fitPoints(points, isWide ? { paddingTopLeft: [420, 60], paddingBottomRight: [80, 60] } : { paddingTopLeft: [30, 70], paddingBottomRight: [30, sheetHeight] });
    // GPS position is read but not a dependency: refitting the map on every GPS update would fight the user's panning
  }, [trip, nearest?.station.index, destination, collapsed]);

  // Clear everything from the map when the panel closes
  useEffect(
    () => () => {
      const controls = mapControlsRef.current;
      controls?.setTripMarkers([]);
      controls?.setUserLocation(null);
      controls?.clearRouteHighlight();
    },
    [mapControlsRef]
  );

  return (
    <section
      aria-label="Find your bus"
      onFocus={(e) => {
        if (e.target.tagName !== 'INPUT') return;
        setIsTyping(true);
        setCollapsed(false);
      }}
      onBlur={(e) => e.target.tagName === 'INPUT' && setIsTyping(false)}
      style={keyboardSheet ? { top: keyboard.top + 8, bottom: 'auto', height: keyboard.height - 8, maxHeight: 'none' } : undefined}
      className="surface fixed z-[1100] inset-x-0 bottom-0 max-h-[58vh] rounded-t-2xl sm:inset-x-auto sm:bottom-auto sm:top-4 sm:left-4 sm:w-[380px] sm:max-h-[calc(100vh-5rem)] sm:rounded-2xl flex flex-col text-neutral-800 dark:text-neutral-100 animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-left-2 duration-200"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        <h2 className="font-bold text-base text-neutral-900 dark:text-white">Find your bus</h2>
        <span className="flex-1" />
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Show trip details' : 'Show map'}
          aria-expanded={!collapsed}
          className="sm:hidden p-1 mr-1 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] cursor-pointer"
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={onClose} aria-label="Close trip planner" className="p-1 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </header>

      {collapsed && (
        <button onClick={() => setCollapsed(false)} className="sm:hidden px-4 pb-3 text-left text-xs text-neutral-600 dark:text-neutral-300 cursor-pointer">
          {trip ? (
            <span className="flex items-center gap-1 flex-wrap">
              {trip.legs.map((leg, k) => (
                <React.Fragment key={k}>
                  {k > 0 && <ArrowRight className="w-3 h-3 text-neutral-500" />}
                  <LineBadge line={leg.line} />
                </React.Fragment>
              ))}
              <span className="ml-1">
                ~{formatMinutes(trip.minutes)} · board at <b>{trip.legs[0].from.name}</b>, get off at <b>{trip.legs[trip.legs.length - 1].to.name}</b>
              </span>
            </span>
          ) : nearest ? (
            <span>
              Nearest stop: <b>{nearest.station.name}</b> · ~{formatDistance(nearest.walkM)}
            </span>
          ) : (
            'Tap to plan a trip'
          )}
        </button>
      )}

      <div ref={scrollRef} className={`min-h-0 px-4 pb-4 overflow-y-auto overscroll-contain space-y-3 ${collapsed ? 'hidden sm:block' : ''}`}>
        {/* From */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1">From</div>
          {useGps ? (
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200 dark:border-white/10">
              <LocateFixed className="w-4 h-4 mt-0.5 text-neutral-900 dark:text-white shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                {!planner || (geo.status === 'locating' && !nearest) ? (
                  <span className="flex items-center gap-1.5 text-neutral-500">
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Finding your location…
                  </span>
                ) : geo.status === 'denied' ? (
                  <span className="text-neutral-600 dark:text-neutral-300">Location access is blocked. Allow it in your browser settings, or choose a starting stop.</span>
                ) : geo.status === 'unavailable' && !nearest ? (
                  <span className="text-neutral-600 dark:text-neutral-300">Your location isn't available right now. Choose a starting stop instead.</span>
                ) : isOutsideNetwork ? (
                  <span className="text-neutral-600 dark:text-neutral-300">
                    You seem to be outside the area this map covers: the nearest stop, {nearest.station.name}, is {formatDistance(nearest.walkM)} away.
                  </span>
                ) : nearest ? (
                  <>
                    <div>
                      Nearest stop: <b>{nearest.station.name}</b> · ~{formatDistance(nearest.walkM)} walk
                    </div>
                    {origins.length > 1 && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        Also near: {origins.slice(1).map((o) => `${o.station.name} (${formatDistance(o.walkM)})`).join(', ')}
                      </div>
                    )}
                    {geo.position?.accuracy > 150 && (
                      <div className="text-xs text-amber-600 dark:text-amber-400">GPS accuracy is low (±{formatDistance(geo.position.accuracy)}).</div>
                    )}
                  </>
                ) : null}
              </div>
              <button onClick={() => setUseGps(false)} className="text-xs font-medium text-neutral-900 dark:text-white hover:underline cursor-pointer shrink-0">
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {originStop ? (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-neutral-100 dark:bg-white/[0.06] text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                    <b className="truncate">{originStop.name}</b>
                  </span>
                  <button onClick={() => setOriginStop(null)} aria-label="Clear starting stop" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-white cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <StopSearch
                  planner={planner}
                  placeholder="Starting stop"
                  onSelect={pickOrigin}
                  recent={history.stops}
                  autoFocus={isWideScreen && !initialOrigin && !initialDestination}
                  action={
                    <button
                      onClick={() => setUseGps(true)}
                      data-tip="Use my location"
                      aria-label="Use my location"
                      className="p-1 -mr-1 rounded-lg text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-white/10 cursor-pointer shrink-0"
                    >
                      <LocateFixed className="w-4 h-4" />
                    </button>
                  }
                />
              )}
            </div>
          )}
        </div>

        {/* To */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">To</div>
            {canSwap && (
              <button
                onClick={swapStops}
                data-tip="Swap start and destination"
                aria-label="Swap start and destination"
                className="-my-1 p-1 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-white dark:hover:bg-white/10 cursor-pointer"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {destination ? (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-neutral-100 dark:bg-white/[0.06] text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
                <b className="truncate">{destination.name}</b>
              </span>
              <button onClick={() => setDestination(null)} aria-label="Clear destination" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-white cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <StopSearch
              planner={planner}
              placeholder="Where do you want to go?"
              onSelect={pickDestination}
              autoFocus={isWideScreen && !!initialOrigin}
              recent={history.stops.filter((st) => st.name !== originStop?.name)}
            />
          )}
        </div>

        {/* Results */}
        {alreadyThere ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {destination.landmark && originStop?.name !== destination.name
              ? `${destination.name} is a ~${formatDistance(destination.walkM)} walk from ${destination.stop.name}.`
              : `You're already at ${destination.name}.`}
          </p>
        ) : trips && trips.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-300">No bus connection found between these stops on this map.</p>
        ) : trips ? (
          <ul className="space-y-2" aria-label="Trip options">
            {trips.map((t, i) => {
              const isSelected = i === selected;
              return (
                <li key={t.legs.map((l) => l.line.svgId).join('>')}>
                  <div
                    // The selected option takes a wash of its first bus's route colour
                    style={{ '--route': t.legs[0].line.color }}
                    className={`rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-[color-mix(in_oklab,var(--route)_45%,white)] bg-[color-mix(in_oklab,var(--route)_7%,white)] dark:border-[color-mix(in_oklab,var(--route)_45%,transparent)] dark:bg-[color-mix(in_oklab,var(--route)_10%,transparent)]'
                        : 'border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20'
                    }`}
                  >
                    <button onClick={() => setSelected(i)} aria-expanded={isSelected} className="w-full text-left p-2.5 cursor-pointer">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 flex-wrap min-w-0">
                          {t.legs.map((leg, k) => (
                            <React.Fragment key={k}>
                              {k > 0 && <ArrowRight className="w-3 h-3 text-neutral-500" />}
                              <LineBadge line={leg.line} />
                            </React.Fragment>
                          ))}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
                          ~{formatMinutes(t.minutes)}
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'rotate-180' : ''}`} />
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {t.legs.length === 1 ? 'Direct bus' : `${t.legs.length} buses, ${t.legs.length - 1} change${t.legs.length > 2 ? 's' : ''}`} · board at{' '}
                        {t.legs[0].from.name}
                      </div>
                    </button>
                    {isSelected && (
                      <div className="px-2.5 pb-2.5">
                        <TripSteps trip={t} origin={originStop} destination={destination} fromGps={useGps} />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : !originStop && !destination && !useGps && history.trips.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Recent trips</div>
              <button onClick={clearHistory} className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer">
                Clear
              </button>
            </div>
            <ul className="space-y-1" aria-label="Recent trips">
              {history.trips.map(({ from, to }) => (
                <li key={`${from.index}>${to.index}`}>
                  <button
                    onClick={() => {
                      setUseGps(false);
                      setOriginStop(from);
                      setDestination(to);
                    }}
                    className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/[0.06] text-sm text-left cursor-pointer"
                  >
                    <History className="w-4 h-4 text-neutral-500 shrink-0" />
                    <span className="truncate font-medium">{from.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="truncate font-medium">{to.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[10px] leading-snug text-neutral-500">
          Routes follow this map; times are rough estimates. Stop locations come from OpenStreetMap, and some are approximate. Your dot on the map is
          approximate because the map is a schematic.
        </p>
      </div>
    </section>
  );
}
