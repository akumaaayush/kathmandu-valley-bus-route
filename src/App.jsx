import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapViewer from './components/MapViewer';
import Controls from './components/Controls';
import LegendModal from './components/LegendModal';
import AttributionBar from './components/AttributionBar';
import TripPanel from './components/TripPanel';
import MapSearchBar from './components/MapSearchBar';
import SpotBanner from './components/SpotBanner';
import RouteBanner from './components/RouteBanner';
import LineChooser from './components/LineChooser';
import HelpTour, { isTourSeen, pulseTarget } from './components/HelpTour';
import Tooltips from './components/Tooltips';
import { loadLineFinder, loadPlanner } from './usePlanner';
import { getOperatorRoutes } from './data/dedicatedRoutesData';
import { BUS_SERVICES } from './data/legendData';
import { readShareLink, writeShareLink } from './shareLink';

// SVG element IDs for the selected branch codes of an operator
const getSubRouteSvgIds = (operatorName, codes) => [
  ...new Set(
    getOperatorRoutes(operatorName)
      .filter((sr) => codes.includes(sr.code))
      .map((sr) => sr.svgId)
      .filter(Boolean)
  ),
];

export default function App() {
  const [initialLink] = useState(readShareLink);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [tapInfo, setTapInfo] = useState(null); // lines and stop under a map tap, for the line chooser
  // Lines at a spot (tapped point or searched stop), across operators: { title, lines, selectedIds }; [] = all
  const [spot, setSpot] = useState(null);
  // The route panel (spot card / operator routes) can be tucked to the left edge; new content opens it again
  const [isRoutePanelCollapsed, setIsRoutePanelCollapsed] = useState(false);
  const [tripPick, setTripPick] = useState(null); // { kind: 'origin' | 'destination', station, key } for an open planner
  // A shared trip link opens the planner; it takes precedence over a shared route or pin
  const [isTripOpen, setIsTripOpen] = useState(initialLink.trip !== null);
  // Prefilled stops for the trip planner; `key` remounts the panel for each new request
  // origin / destination: station objects, or stop names from a shared link (resolved once the planner loads)
  const [tripRequest, setTripRequest] = useState({
    key: 0,
    origin: initialLink.trip?.from ?? null,
    destination: initialLink.trip?.to ?? null,
    option: initialLink.trip?.option ?? 0,
  });
  const [tripShare, setTripShare] = useState(null); // { from, to, option } reported by the open trip panel
  const [selectedStop, setSelectedStop] = useState(null); // { station, lines } from the stop search
  const [activeRoute, setActiveRoute] = useState(initialLink.trip ? null : initialLink.service);
  const [selectedSubRouteCodes, setSelectedSubRouteCodes] = useState(initialLink.trip ? [] : initialLink.subRouteCodes);
  const [activePlace, setActivePlace] = useState(initialLink.trip ? null : initialLink.place);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('ktm_transit_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } catch (e) {
      return 'light';
    }
  });
  const mapControlsRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('ktm_transit_theme', theme);
    } catch (e) {}
  }, [theme]);

  // Fade out the boot screen from index.html once the app has painted, but not before one pass of its logo
  // animation (a fast start would otherwise just flash it)
  useEffect(() => {
    const BOOT_MIN_MS = 900;
    const wait = Math.max(0, (window.__bootStart ?? 0) + BOOT_MIN_MS - performance.now());
    const timer = setTimeout(() => {
      requestAnimationFrame(() => {
        const boot = document.getElementById('boot');
        if (!boot) return;
        boot.classList.add('boot-done');
        setTimeout(() => boot.remove(), 400);
      });
    }, wait);
    return () => clearTimeout(timer);
  }, []);

  // First plain visit: show the how-to once the boot screen has gone. A shared link opens straight to its content.
  useEffect(() => {
    const { service, place, trip, spot: sharedSpot } = initialLink;
    if (service || place || trip || sharedSpot || isTourSeen()) return;
    const timer = setTimeout(() => setIsHelpOpen(true), 1400);
    return () => clearTimeout(timer);
  }, [initialLink]);

  // "Show me" from the tour: close it and ring the real control (the search bar only shows with the planner closed)
  const handleTourShowMe = (target) => {
    setIsHelpOpen(false);
    setIsLegendOpen(false);
    if (target === 'search') setIsTripOpen(false);
    pulseTarget(target);
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const registerMapControls = useCallback((controls) => {
    mapControlsRef.current = controls;
  }, []);

  // Restore the map view from a shared link (MapViewer registers its controls before this runs)
  useEffect(() => {
    const { service, subRouteCodes, place, trip, spot: sharedSpot } = initialLink;
    if (trip) return; // the trip panel restores itself
    // "Lines here": rebuild the card from the stop network (unknown codes are dropped)
    if (sharedSpot && !service) {
      let cancelled = false;
      loadPlanner().then(({ lines, stations, linesAtStop }) => {
        if (cancelled) return;
        const byCode = (code) => lines.find((l) => l.codes[0] === code);
        const spotLines = sharedSpot.codes.map(byCode).filter(Boolean);
        if (spotLines.length === 0) return;
        const stop = stations.find((st) => Math.hypot(st.x - sharedSpot.x, st.y - sharedSpot.y) <= 1.5) || null;
        openSpot({
          title: stop?.name ?? 'Lines here',
          lines: spotLines,
          selectedIds: sharedSpot.selected.map(byCode).filter(Boolean).map((l) => l.svgId),
          stop,
          stopLines: stop ? linesAtStop(stop) : null,
          at: { x: sharedSpot.x, y: sharedSpot.y },
        });
        if (!place) mapControlsRef.current?.flyToLocation(sharedSpot.x, sharedSpot.y, 5.2);
      });
      return () => {
        cancelled = true;
      };
    }
    if (place) {
      const subRoute = service && subRouteCodes.length === 1
        ? getOperatorRoutes(service.name).find((sr) => sr.code === subRouteCodes[0])
        : null;
      mapControlsRef.current?.flyToLocation(place.x, place.y, 5.8, {
        name: place.name,
        subtitle: subRoute ? subRoute.name : service ? `${service.name} (${service.code})` : place.category,
        color: service?.color,
      });
    }
    if (service) {
      const svgIds = getSubRouteSvgIds(service.name, subRouteCodes);
      mapControlsRef.current?.highlightRoute(service.name, svgIds.length > 0 ? svgIds : null);
    }
  }, [initialLink]);

  // Keep the URL in sync so the current view can be shared
  useEffect(() => {
    writeShareLink({
      service: activeRoute,
      subRouteCodes: selectedSubRouteCodes,
      place: activePlace,
      trip: isTripOpen ? tripShare : null,
      spot: spot?.at && !activeRoute && !isTripOpen
        ? {
            ...spot.at,
            codes: spot.lines.map((l) => l.codes[0]),
            selected: spot.lines.filter((l) => spot.selectedIds.includes(l.svgId)).map((l) => l.codes[0]),
          }
        : null,
    });
  }, [activeRoute, selectedSubRouteCodes, activePlace, isTripOpen, tripShare, spot]);

  const handleZoomIn = () => {
    mapControlsRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapControlsRef.current?.zoomOut();
  };

  const handleResetView = () => {
    mapControlsRef.current?.resetView();
  };

  const handleToggleLegend = () => {
    setIsLegendOpen((prev) => !prev);
  };

  // The trip planner draws its own highlight, so drop any operator highlight first
  const openTrip = ({ origin = null, destination = null } = {}) => {
    setIsLegendOpen(false);
    setTapInfo(null);
    setSelectedStop(null);
    setActivePlace(null);
    mapControlsRef.current?.clearPlacePin(); // the planner places its own pins
    setSpot(null);
    setActiveRoute(null);
    setSelectedSubRouteCodes([]);
    mapControlsRef.current?.clearRouteHighlight();
    setTripShare(null);
    setTripRequest((prev) => ({ key: prev.key + 1, origin, destination, option: 0 }));
    setIsTripOpen(true);
  };

  const handleToggleTrip = () => {
    if (isTripOpen) setIsTripOpen(false);
    else openTrip();
  };

  // Stop search: fly to the stop and show its buses
  const handleSelectStop = (station, lines) => {
    setTapInfo(null);
    setSpot(null);
    setSelectedStop({ station, lines });
    setActiveRoute(null);
    setSelectedSubRouteCodes([]);
    mapControlsRef.current?.clearRouteHighlight();
    mapControlsRef.current?.flyToLocation(station.x, station.y, 5.4, {
      name: station.name,
      subtitle: `${lines.length} bus route${lines.length === 1 ? '' : 's'}`,
      color: '#0f172a',
    });
    setActivePlace({ name: station.name, x: station.x, y: station.y });
  };

  // Show one of the stop's buses through the regular operator banner
  const handleShowLine = (line) => {
    const service = BUS_SERVICES.find((s) => s.code === line.op);
    if (!service) return;
    const branchCodes = getOperatorRoutes(service.name).map((sr) => sr.code);
    setSelectedStop(null);
    setSpot(null);
    setIsRoutePanelCollapsed(false);
    setActiveRoute(service);
    setSelectedSubRouteCodes(line.codes.filter((code) => branchCodes.includes(code)));
    mapControlsRef.current?.highlightRoute(service.name, [line.svgId]);
  };

  // --- Tapping the map: which bus is this line? / start or go from this stop ---
  const TAP_LINE_RADIUS_PX = 22; // finger-sized; parallel lines in a bundle are only a few px apart when zoomed out
  const TAP_STOP_RADIUS_PX = 28;

  const highlightSpot = (next) => {
    const ids = next.selectedIds.length > 0 ? next.selectedIds : next.lines.map((l) => l.svgId);
    mapControlsRef.current?.highlightRoute('Spot', ids, { fly: false });
  };

  // Show the lines at a spot, with some of them selected (none = all)
  // stop / stopLines: the stop at the spot (if any) and every bus serving it, for Start / Go and "all buses here"
  // at: canvas position of the spot, for the share link
  const openSpot = ({ title, lines, selectedIds = [], stop = null, stopLines = null, at = null }) => {
    const next = { title, lines, selectedIds, stop, stopLines, at };
    setSelectedStop(null);
    setActiveRoute(null);
    setSelectedSubRouteCodes([]);
    setSpot(next);
    setIsRoutePanelCollapsed(false);
    highlightSpot(next);
  };

  // Like the operator branch bar: from "all", a tap isolates one line; then taps add or remove lines
  const handleToggleSpotLine = (line) => {
    const ids = spot.selectedIds;
    const nextIds = ids.length === 0 ? [line.svgId] : ids.includes(line.svgId) ? ids.filter((id) => id !== line.svgId) : [...ids, line.svgId];
    const next = { ...spot, selectedIds: nextIds };
    setSpot(next);
    highlightSpot(next);
  };

  const handleShowAllSpotLines = () => {
    const next = { ...spot, selectedIds: [] };
    setSpot(next);
    highlightSpot(next);
  };

  const handleCloseSpot = () => {
    setSpot(null);
    mapControlsRef.current?.clearRouteHighlight();
  };

  // Put back the highlight that was showing before a tap preview
  const restoreHighlight = () => {
    if (isTripOpen) return; // the trip panel owns the highlight
    if (spot) {
      highlightSpot(spot);
    } else if (activeRoute) {
      const svgIds = getSubRouteSvgIds(activeRoute.name, selectedSubRouteCodes);
      mapControlsRef.current?.highlightRoute(activeRoute.name, svgIds.length > 0 ? svgIds : null, { fly: false });
    } else {
      mapControlsRef.current?.clearRouteHighlight();
    }
  };

  const previewLines = (lines) => {
    if (isTripOpen || lines.length === 0) return;
    mapControlsRef.current?.highlightRoute('Preview', lines.map((l) => l.svgId), { fly: false });
  };

  const closeTapInfo = () => {
    if (!tapInfo) return;
    setTapInfo(null);
    restoreHighlight();
  };

  const handleMapTap = async (tap) => {
    if (isLegendOpen) return;
    const { findAt } = await loadLineFinder();
    const found = findAt(tap.x, tap.y, TAP_LINE_RADIUS_PX * tap.pxScale, TAP_STOP_RADIUS_PX * tap.pxScale);
    // With the planner open only stops matter: a small card offers Set as start / destination
    if (isTripOpen) {
      if (!found.stop) return closeTapInfo();
      setTapInfo({ ...found, screen: tap.screen, at: { x: tap.x, y: tap.y } });
      return;
    }
    if (!found.stop && found.lines.length === 0) return; // empty map: keep what is showing
    // Otherwise the spot card shows everything at the tapped point (one card, updated on every tap)
    const lines = found.lines.length > 0 ? found.lines.map((h) => h.line) : found.stopLines;
    setTapInfo(null);
    openSpot({
      title: found.stop?.name ?? 'Lines here',
      lines,
      stop: found.stop,
      stopLines: found.stopLines,
      // At a stop, share the stop's own position so the link finds the same stop again
      at: found.stop ? { x: found.stop.x, y: found.stop.y } : { x: tap.x, y: tap.y },
    });
  };

  const handleShowStopLines = () => {
    const next = { ...spot, lines: spot.stopLines, selectedIds: [] };
    setSpot(next);
    highlightSpot(next);
  };

  // Picking a line keeps the other lines at the spot one tap away
  const handleChooseLine = (line) => {
    const title = tapInfo?.stop?.name ?? 'Lines here';
    const lines = tapInfo?.lines.map((h) => h.line) ?? [line];
    const at = tapInfo?.stop ? { x: tapInfo.stop.x, y: tapInfo.stop.y } : tapInfo?.at ?? null;
    setTapInfo(null);
    openSpot({ title, lines, selectedIds: [line.svgId], at });
  };

  const handleTapStart = (stop) => {
    setTapInfo(null);
    if (isTripOpen) setTripPick((prev) => ({ kind: 'origin', station: stop, key: (prev?.key ?? 0) + 1 }));
    else openTrip({ origin: stop });
  };

  const handleTapGo = (stop) => {
    setTapInfo(null);
    if (isTripOpen) setTripPick((prev) => ({ kind: 'destination', station: stop, key: (prev?.key ?? 0) + 1 }));
    else openTrip({ destination: stop });
  };

  const handleTapStopDetails = (stop) => {
    const lines = tapInfo?.stopLines ?? [];
    setTapInfo(null);
    handleSelectStop(stop, lines);
  };

  const handleClearActiveRoute = () => {
    setActiveRoute(null);
    setSelectedSubRouteCodes([]);
    mapControlsRef.current?.clearRouteHighlight();
  };

  const handleToggleSubRoute = (subRoute) => {
    if (!activeRoute) return;

    let nextCodes;
    // If currently showing all branches, clicking one isolates to just that branch
    if (selectedSubRouteCodes.length === 0) {
      nextCodes = [subRoute.code];
    } else if (selectedSubRouteCodes.includes(subRoute.code)) {
      // Toggle off
      nextCodes = selectedSubRouteCodes.filter((code) => code !== subRoute.code);
    } else {
      // Toggle on (multi-select)
      nextCodes = [...selectedSubRouteCodes, subRoute.code];
    }

    setSelectedSubRouteCodes(nextCodes);

    if (nextCodes.length === 0) {
      mapControlsRef.current?.highlightRoute(activeRoute.name, null);
    } else {
      const activeSvgIds = getSubRouteSvgIds(activeRoute.name, nextCodes);
      mapControlsRef.current?.highlightRoute(activeRoute.name, activeSvgIds.length > 0 ? activeSvgIds : null);
    }
  };

  const handleSelectAllRoutes = () => {
    setSelectedSubRouteCodes([]);
    if (activeRoute) {
      mapControlsRef.current?.highlightRoute(activeRoute.name, null);
    }
  };

  const handleNavigateToLocation = (location) => {
    setIsLegendOpen(false);
    setIsTripOpen(false);
    setSpot(null);
    setIsRoutePanelCollapsed(false);
    if (location.x !== undefined && location.y !== undefined) {
      mapControlsRef.current?.flyToLocation(location.x, location.y, 5.8, {
        name: location.name,
        subtitle: location.subtitle,
        color: location.color,
      });
      setActivePlace({ name: location.name, x: location.x, y: location.y });
    }
    if (location.service) {
      setActiveRoute(location.service);
      if (location.subRoute) {
        setSelectedSubRouteCodes([location.subRoute.code]);
        mapControlsRef.current?.highlightRoute(location.service.name, [location.subRoute.svgId]);
      } else {
        setSelectedSubRouteCodes([]);
        mapControlsRef.current?.highlightRoute(location.service.name, null);
      }
    }
  };

  const subRoutes = activeRoute ? getOperatorRoutes(activeRoute.name) : [];

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-white dark:bg-neutral-950 select-none">
      {/* Pure Vector Map with Topographic Valley Relief Base */}
      <MapViewer
        registerMapControls={registerMapControls}
        onPlaceCleared={() => {
          setActivePlace(null);
          setSelectedStop(null);
        }}
        onMapTap={handleMapTap}
        onMapMoveStart={closeTapInfo}
      />

      {tapInfo && (
        <LineChooser
          info={tapInfo}
          tripMode={isTripOpen}
          onSelectLine={handleChooseLine}
          onPreview={(line) => previewLines(line ? [line] : tapInfo.lines.map((h) => h.line))}
          onStart={handleTapStart}
          onGo={handleTapGo}
          onStopDetails={handleTapStopDetails}
          onClose={closeTapInfo}
        />
      )}

      {spot && !activeRoute && (
        <SpotBanner
          spot={spot}
          collapsed={isRoutePanelCollapsed}
          onCollapse={() => setIsRoutePanelCollapsed(true)}
          onExpand={() => setIsRoutePanelCollapsed(false)}
          onToggleLine={handleToggleSpotLine}
          onShowAll={handleShowAllSpotLines}
          onShowOperator={handleShowLine}
          onStart={handleTapStart}
          onGo={handleTapGo}
          onShowStopLines={handleShowStopLines}
          onPreview={(line) => (line ? mapControlsRef.current?.highlightRoute('Spot', [line.svgId], { fly: false }) : highlightSpot(spot))}
          onClose={handleCloseSpot}
        />
      )}

      {activeRoute && (
        <RouteBanner
          route={activeRoute}
          subRoutes={subRoutes}
          selectedCodes={selectedSubRouteCodes}
          collapsed={isRoutePanelCollapsed}
          onCollapse={() => setIsRoutePanelCollapsed(true)}
          onExpand={() => setIsRoutePanelCollapsed(false)}
          onToggle={handleToggleSubRoute}
          onShowAll={handleSelectAllRoutes}
          onPreview={(sr) => (sr?.svgId ? mapControlsRef.current?.highlightRoute(activeRoute.name, [sr.svgId], { fly: false }) : restoreHighlight())}
          onClear={handleClearActiveRoute}
        />
      )}

      {/* Floating Action Controls */}
      <Controls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        onToggleLegend={handleToggleLegend}
        isLegendOpen={isLegendOpen}
        onToggleTrip={handleToggleTrip}
        isTripOpen={isTripOpen}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenHelp={() => {
          setIsLegendOpen(false);
          setIsHelpOpen(true);
        }}
        isHelpOpen={isHelpOpen}
      />

      {isTripOpen ? (
        <TripPanel
          key={tripRequest.key}
          mapControlsRef={mapControlsRef}
          initialOrigin={tripRequest.origin}
          initialDestination={tripRequest.destination}
          initialOption={tripRequest.option}
          onShareStateChange={setTripShare}
          pick={tripPick}
          onClose={() => {
            setIsTripOpen(false);
            setTripShare(null);
          }}
        />
      ) : (
        <MapSearchBar
          selected={selectedStop}
          onSelectStop={handleSelectStop}
          onClear={() => {
            setSelectedStop(null);
            setActivePlace(null);
            mapControlsRef.current?.clearPlacePin();
          }}
          onShowLine={(line) =>
            selectedStop &&
            openSpot({
              title: selectedStop.station.name,
              lines: selectedStop.lines,
              selectedIds: [line.svgId],
              stop: selectedStop.station,
              stopLines: selectedStop.lines,
              at: { x: selectedStop.station.x, y: selectedStop.station.y },
            })
          }
          onDirectionsFrom={(station) => openTrip({ origin: station })}
          onDirectionsTo={(station) => openTrip({ destination: station })}
        />
      )}

      {/* Attribution Bar */}
      <AttributionBar />

      {/* Web Format Legend Modal with Full City Route Search & Direct Map Navigation */}
      <LegendModal
        isOpen={isLegendOpen}
        onClose={() => setIsLegendOpen(false)}
        onNavigateToLocation={handleNavigateToLocation}
        theme={theme}
      />

      {isHelpOpen && <HelpTour onClose={() => setIsHelpOpen(false)} onShowMe={handleTourShowMe} />}

      <Tooltips />
    </main>
  );
}
