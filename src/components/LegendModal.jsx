import React, { useEffect, useState } from 'react';
import { X, Search, BookOpen, ArrowRight, ArrowLeft, MapPin, Bus, Route, RotateCcw, Navigation, ChevronDown } from 'lucide-react';
import { BUS_SERVICES, POPULAR_HUBS, ROUTE_NOTATION_EXAMPLES, ABBREVIATIONS } from '../data/legendData';
import { findBusesForPlaceQuery } from '../data/placeBusIndex';
import { ALL_MAP_PLACES, getPlaceCoordinates } from '../data/placesData';
import { getOperatorRoutes } from '../data/dedicatedRoutesData';

const HUBS_COLLAPSED = 8;

const TABS = [
  { id: 'services', label: 'Operators' },
  { id: 'direction', label: 'Directions' },
  { id: 'abbreviations', label: 'Symbols' },
];

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export default function LegendModal({ isOpen, onClose, onNavigateToLocation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('services'); // 'services' | 'direction' | 'abbreviations'
  const [showAllHubs, setShowAllHubs] = useState(false);
  const [openCodes, setOpenCodes] = useState(() => new Set()); // operators expanded on phones
  const isWide = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleOperator = (code) =>
    setOpenCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const totalRoutes = BUS_SERVICES.reduce((acc, s) => acc + (s.routes ? s.routes.length : 0), 0);

  const toNepaliDigits = (num) => {
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return String(num).replace(/\d/g, (d) => nepaliDigits[d]);
  };

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // Spatially query all 1,100+ verified places from clean-map.jpg
  const placeLookup = trimmedQuery ? findBusesForPlaceQuery(trimmedQuery) : { codes: [], matchedPlaces: [] };
  const placeMatchedCodes = new Set(placeLookup.codes);

  const filteredServices = BUS_SERVICES.filter((s) => {
    if (!trimmedQuery) return true;

    // Search by operator name (English or Devanagari)
    if (s.name.toLowerCase().includes(trimmedQuery) || s.nepali.includes(searchQuery)) return true;

    // Search by letter code (exact code like "S", "N")
    if (s.code.toLowerCase() === trimmedQuery) return true;

    // Search by specific route code (e.g. "S1", "N2", "B10", "T4")
    if (s.routes.some((r) => r.toLowerCase().includes(trimmedQuery))) return true;

    // Search by corridor description
    if (s.corridor && s.corridor.toLowerCase().includes(trimmedQuery)) return true;

    // Search by key stops
    if (s.stops.some((stop) => stop.toLowerCase().includes(trimmedQuery))) return true;

    // Search across all 1,100+ extracted places & landmarks from clean-map.jpg
    if (placeMatchedCodes.has(s.code)) return true;

    return false;
  });

  const handleNavigateToMap = (targetName, service, subRoute = null) => {
    if (!onNavigateToLocation) return;

    // 1. Try finding coordinates for the specific query or target name
    let coords = getPlaceCoordinates(targetName);

    // 2. If not found, try the matched places from placeLookup
    if (!coords && placeLookup.matchedPlaces.length > 0) {
      for (const placeName of placeLookup.matchedPlaces) {
        coords = getPlaceCoordinates(placeName);
        if (coords) break;
      }
    }

    // 3. If still not found, fallback to service's stops
    if (!coords && service.stops && service.stops.length > 0) {
      for (const st of service.stops) {
        coords = getPlaceCoordinates(st);
        if (coords) break;
      }
    }

    if (coords) {
      onNavigateToLocation({
        x: coords.x,
        y: coords.y,
        name: coords.name,
        subtitle: subRoute ? subRoute.name : `${service.name} (${service.code})`,
        color: service.color,
        service: service,
        subRoute: subRoute,
      });
    } else {
      onNavigateToLocation({
        name: subRoute ? subRoute.name : service.name,
        subtitle: subRoute ? subRoute.description : service.corridor,
        color: service.color,
        service: service,
        subRoute: subRoute,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-stretch sm:items-center justify-center sm:p-6 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bus routes and stops"
        className="surface relative w-full max-w-3xl h-[100dvh] sm:h-[min(88vh,820px)] flex flex-col rounded-none sm:rounded-xl overflow-hidden text-neutral-800 dark:text-neutral-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/15 flex items-center justify-center text-neutral-700 dark:text-neutral-200 shadow-xs">
              <BookOpen className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="font-semibold text-sm sm:text-base text-neutral-900 dark:text-white tracking-tight">Bus routes &amp; stops</h2>
              <p className="hidden sm:block text-xs text-neutral-500 dark:text-neutral-400">
                Find which buses serve a stop, then show them on the map
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close legend"
            className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 pb-3 border-b border-neutral-100 dark:border-white/[0.07] shrink-0">
          <div role="tablist" aria-label="Legend sections" className="grid grid-cols-3 p-0.5 rounded-lg bg-neutral-100 dark:bg-white/[0.06]">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white text-neutral-950 shadow-sm dark:bg-white/[0.12] dark:text-white dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]'
                      : 'text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'services' && <span className="ml-1 tabular-nums text-neutral-500 dark:text-neutral-400">{BUS_SERVICES.length}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body Content */}
        {/* Light mode: grey canvas so the white cards on it read as objects */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 bg-neutral-50 dark:bg-transparent">
          {/* TAB 1: BUS SERVICES & ROUTE SEARCH */}
          {activeTab === 'services' && (
            <div className="space-y-3.5">
              {/* Network at a glance: one quiet strip, not a row of KPI cards */}
              <dl className="grid grid-cols-2 sm:grid-cols-4 rounded-xl bg-white dark:bg-transparent border border-neutral-200 dark:border-white/10 divide-x divide-y sm:divide-y-0 divide-neutral-200 dark:divide-white/10 overflow-hidden">
                {[
                  { value: BUS_SERVICES.length, label: 'Bus operators', nepali: 'बस कम्पनीहरू' },
                  { value: totalRoutes, label: 'Route lines', nepali: 'सञ्चालित रुटहरू' },
                  { value: ALL_MAP_PLACES.length.toLocaleString(), label: 'Places & stops', nepali: 'स्थान तथा स्टपहरू' },
                  { value: POPULAR_HUBS.length, label: 'Major hubs', nepali: 'मुख्य ट्रान्जिट हबहरू' },
                ].map((stat) => (
                  <div key={stat.label} className="px-3 py-2.5">
                    <dt className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {stat.label} <span className="sr-only">({stat.nepali})</span>
                    </dt>
                    <dd className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-lg font-semibold tabular-nums tracking-tight text-neutral-950 dark:text-white">{stat.value}</span>
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate" lang="ne">
                        {toNepaliDigits(stat.value)} {stat.nepali}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search a stop, place or route (e.g. Kalanki, S1)"
                  aria-label="Search bus services by stop, place or route"
                  className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-white/[0.06] border border-neutral-200 dark:border-white/15 rounded-xl text-xs text-neutral-800 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/30 focus:ring-2 focus:ring-neutral-100 dark:focus:ring-white/10 shadow-xs transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Popular Hub Quick-Filter Chips */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                  <span>Popular stops</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(showAllHubs ? POPULAR_HUBS : POPULAR_HUBS.slice(0, HUBS_COLLAPSED)).map((hub) => {
                    const isSelected = trimmedQuery === hub.toLowerCase();
                    return (
                      <button
                        key={hub}
                        onClick={() => setSearchQuery(isSelected ? '' : hub)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer border ${
                          isSelected
                            ? 'btn-primary border-neutral-900 dark:border-white font-medium'
                            : 'bg-neutral-200/60 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 border-transparent hover:bg-neutral-200 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                      >
                        {hub}
                      </button>
                    );
                  })}
                  {POPULAR_HUBS.length > HUBS_COLLAPSED && (
                    <button
                      onClick={() => setShowAllHubs((v) => !v)}
                      aria-expanded={showAllHubs}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                    >
                      {showAllHubs ? 'Show less' : `+${POPULAR_HUBS.length - HUBS_COLLAPSED} more`}
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Status Badge */}
              {searchQuery && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-neutral-100/90 dark:bg-white/[0.06] border border-neutral-200 dark:border-white/15 text-xs text-neutral-700 dark:text-neutral-200">
                  <div className="flex items-center gap-1.5 truncate">
                    <Route className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />
                    <span className="truncate">
                      {filteredServices.length === 1
                        ? '1 bus service'
                        : `${filteredServices.length} bus services`}{' '}
                      go through <strong className="text-neutral-900 dark:text-white font-semibold">"{searchQuery}"</strong>
                      {placeLookup.matchedPlaces.length > 0 && (
                        <span className="text-neutral-500 dark:text-neutral-400 text-[11px] ml-1.5">
                          (matches: {placeLookup.matchedPlaces.slice(0, 3).join(', ')}
                          {placeLookup.matchedPlaces.length > 3 ? '...' : ''})
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer transition-colors shrink-0 ml-2"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
              )}

              {/* Bus operators. Phones: one compact row each, tap to expand. Wider screens: expanded cards in two columns. */}
              {filteredServices.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  {filteredServices.map((service) => {
                    const navTarget = searchQuery || (placeLookup.matchedPlaces[0] || service.stops[0]);
                    const isExpanded = isWide || openCodes.has(service.code) || (trimmedQuery && filteredServices.length <= 3);
                    const operatorSubRoutes = getOperatorRoutes(service.name);

                    return (
                      <div
                        key={service.code}
                        className="flex flex-col rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-[0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-none transition-colors hover:border-neutral-300 dark:hover:border-white/20"
                        style={{ '--route': service.color }}
                      >
                        {/* Header: tap to expand on phones */}
                        <button
                          onClick={() => !isWide && toggleOperator(service.code)}
                          aria-expanded={isExpanded}
                          disabled={isWide}
                          className="flex items-center gap-2.5 px-3 pt-3 pb-2 text-left cursor-pointer md:cursor-default"
                        >
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-mono font-semibold text-xs shrink-0"
                            style={{ backgroundColor: service.color }}
                          >
                            {service.code}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-sm text-neutral-900 dark:text-white truncate">{service.name}</span>
                            <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate" lang="ne">
                              {service.nepali}
                            </span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-neutral-500 dark:text-neutral-400 shrink-0 transition-transform duration-200 md:hidden ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>

                        {/* Route codes: always visible, each highlights its branch on the map */}
                        <div className="flex flex-wrap items-center gap-1 px-3 pb-3">
                          {service.routes.map((rt) => {
                            const matchedSubRoute = operatorSubRoutes.find(
                              (sr) =>
                                sr.code.toLowerCase() === rt.toLowerCase() ||
                                sr.code.toLowerCase().startsWith(rt.toLowerCase()) ||
                                sr.code.toLowerCase().includes(rt.toLowerCase())
                            );
                            return (
                              <button
                                key={rt}
                                onClick={() => handleNavigateToMap(navTarget, service, matchedSubRoute || null)}
                                className="inline-flex items-center min-h-6 px-1.5 rounded-md text-[11px] font-mono font-semibold text-white hover:ring-2 hover:ring-offset-1 hover:ring-neutral-900/30 dark:hover:ring-white/40 dark:ring-offset-neutral-950 transition-shadow cursor-pointer"
                                style={{ backgroundColor: service.color }}
                                data-tip={matchedSubRoute ? `Show ${matchedSubRoute.name} on the map` : `Show ${rt} on the map`}
                              >
                                {rt}
                              </button>
                            );
                          })}
                        </div>

                        {isExpanded && (
                          <div className="flex-1 flex flex-col gap-2.5 px-3 pb-3 pt-2.5 border-t border-neutral-100 dark:border-white/[0.07]">
                            <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                              <span className="font-medium text-neutral-900 dark:text-white">Corridor: </span>
                              {service.corridor}
                            </p>

                            {/* Matched landmark (search hit through the places index) */}
                            {placeLookup.matchedPlaces.length > 0 && placeMatchedCodes.has(service.code) && (
                              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-neutral-600 dark:text-neutral-300">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span>Passes near</span>
                                {placeLookup.matchedPlaces.slice(0, 3).map((pl) => (
                                  <button
                                    key={pl}
                                    onClick={() => handleNavigateToMap(pl, service)}
                                    className="font-medium text-neutral-900 dark:text-white underline underline-offset-2 decoration-neutral-300 dark:decoration-white/30 hover:decoration-current cursor-pointer"
                                  >
                                    {pl}
                                  </button>
                                ))}
                                {placeLookup.matchedPlaces.length > 3 && <span>+{placeLookup.matchedPlaces.length - 3} more</span>}
                              </div>
                            )}

                            {/* Key stops */}
                            <div>
                              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">Key stops</div>
                              <div className="flex flex-wrap gap-1 md:max-h-24 md:overflow-y-auto">
                                {[...service.stops]
                                  .sort((a, b) => {
                                    if (!trimmedQuery) return 0;
                                    const aMatch = a.toLowerCase().includes(trimmedQuery);
                                    const bMatch = b.toLowerCase().includes(trimmedQuery);
                                    if (aMatch && !bMatch) return -1;
                                    if (!aMatch && bMatch) return 1;
                                    return 0;
                                  })
                                  .map((stop) => {
                                    const isMatched = trimmedQuery && stop.toLowerCase().includes(trimmedQuery);
                                    return (
                                      <button
                                        key={stop}
                                        onClick={() => handleNavigateToMap(stop, service)}
                                        className={`px-1.5 py-0.5 rounded-md text-[11px] transition-colors cursor-pointer ${
                                          isMatched
                                            ? 'btn-primary font-medium'
                                            : 'bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/10 hover:text-neutral-950 dark:hover:text-white'
                                        }`}
                                        data-tip={`Show ${stop} on the map`}
                                      >
                                        {stop}
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>

                            <button
                              onClick={() => handleNavigateToMap(navTarget, service)}
                              // mt-auto: pinned to the card bottom so buttons line up across a row
                              className="mt-auto w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-neutral-900 dark:text-white bg-[color-mix(in_oklab,var(--route)_12%,white)] hover:bg-[color-mix(in_oklab,var(--route)_20%,white)] dark:bg-[color-mix(in_oklab,var(--route)_16%,transparent)] dark:hover:bg-[color-mix(in_oklab,var(--route)_26%,transparent)] transition-colors cursor-pointer"
                            >
                              {/* Tinted with the operator's route colour: the one bit of colour on the card, and it means something */}
                              <Navigation className="w-3.5 h-3.5" style={{ color: service.color }} />
                              {searchQuery ? `Show "${searchQuery}" on the map` : 'Show route on the map'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Empty Search State */
                <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.06] space-y-3">
                  <div className="w-10 h-10 mx-auto rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-neutral-500 dark:text-neutral-400">
                    <Bus className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">No bus services found</h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      No routes match "{searchQuery}". Try searching for Thulo Bharyang, Kalanki, Maitidevi, ASCOL, Suncity, or S1.
                    </p>
                  </div>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Search Filter
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DIRECTION & NUMBERING GUIDE */}
          {activeTab === 'direction' && (
            <div className="space-y-4">
              <div className="overflow-hidden border border-neutral-200 dark:border-white/10 rounded-xl bg-white dark:bg-white/[0.06] shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-white/[0.03] text-neutral-600 dark:text-neutral-300 font-semibold border-b border-neutral-200 dark:border-white/15">
                    <tr>
                      <th className="py-2.5 px-3">Operator</th>
                      <th className="py-2.5 px-3 hidden sm:table-cell">Route #</th>
                      <th className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <span>Going<span className="hidden sm:inline"> (outbound)</span></span>
                          <ArrowRight className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                        </div>
                      </th>
                      <th className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          <span>Return<span className="hidden sm:inline"> (inbound)</span></span>
                          <ArrowLeft className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/10 font-medium">
                    {ROUTE_NOTATION_EXAMPLES.map((row, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/60 dark:hover:bg-white/10 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-neutral-800 dark:text-neutral-200">{row.service}</td>
                        <td className="py-2.5 px-3 font-mono text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">{row.number}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className="inline-flex items-center justify-center px-2 py-0.5 rounded text-white font-mono text-[11px] font-bold shadow-2xs"
                            style={{ backgroundColor: row.color }}
                          >
                            {row.outbound}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className="inline-flex items-center justify-center px-2 py-0.5 rounded text-white font-mono text-[11px] font-bold shadow-2xs"
                            style={{ backgroundColor: row.color }}
                          >
                            {row.inbound}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-white/[0.06] border border-neutral-200 dark:border-white/10 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed space-y-1.5 shadow-xs">
                <p className="font-semibold text-neutral-900 dark:text-white ">Official Notation Rule:</p>
                <p>
                  The exact notation style is applied to all bus operators across the map.
                  A route identifier without prime (e.g.{' '}
                  <span className="font-mono font-semibold text-neutral-900 dark:text-white px-1 py-0.5 bg-neutral-100 dark:bg-white/10 rounded">
                    S1
                  </span>
                  ) designates the outbound path, while a prime suffix (e.g.{' '}
                  <span className="font-mono font-semibold text-neutral-900 dark:text-white px-1 py-0.5 bg-neutral-100 dark:bg-white/10 rounded">
                    S1'
                  </span>
                  ) indicates the return path.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: SYMBOLS & ABBREVIATIONS */}
          {activeTab === 'abbreviations' && (
            <div className="space-y-4">
              {/* Common Path */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.06] space-y-2 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-neutral-900 dark:bg-neutral-100 inline-block" />
                    <span className="w-8 h-1.5 bg-neutral-900 dark:bg-neutral-100 inline-block rounded-full" />
                  </div>
                  <span className="font-bold text-xs text-neutral-900 dark:text-white">
                    Common Trunk Corridors
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed pl-0.5">
                  Thick dark charcoal / black lines represent shared high-frequency corridors traversed by multiple overlapping bus services through central Kathmandu Valley.
                </p>
              </div>

              {/* Abbreviations */}
              <div className="space-y-2">
                <span className="font-bold text-xs text-neutral-900 dark:text-white block">
                  Common Landmarks & Map Abbreviations
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ABBREVIATIONS.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.06] shadow-xs"
                    >
                      <span className="font-mono font-bold text-xs text-neutral-900 dark:text-white">{item.short}</span>
                      <span className="text-xs text-neutral-600 dark:text-neutral-300 ml-3 text-right">{item.full}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
