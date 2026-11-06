import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MapPin, LoaderCircle, Navigation, Flag, History } from 'lucide-react';
import { usePlanner } from '../usePlanner';
import { addRecentStop, clearHistory, useHistory } from '../history';

// Stop search on the map. Picking a stop flies to it and opens a card with the buses that stop there and
// shortcuts into the trip planner. The stop network loads when the search is first focused.

const formatWalk = (m) => (m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

function LineBadge({ line, onClick }) {
  return (
    <button
      onClick={onClick}
      data-tip={`${line.operator}: show ${line.label} on the map`}
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-bold text-white cursor-pointer hover:brightness-110 hover:ring-2 hover:ring-offset-1 hover:ring-neutral-300 dark:hover:ring-offset-neutral-900"
      style={{ backgroundColor: line.color }}
    >
      {line.label}
    </button>
  );
}

export default function MapSearchBar({ selected, onSelectStop, onClear, onDirectionsFrom, onDirectionsTo, onShowLine }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [wantsPlanner, setWantsPlanner] = useState(false);
  const planner = usePlanner(wantsPlanner);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const trimmed = query.trim();
  const history = useHistory(planner);
  // Empty field: recent stops instead of search results
  const showingRecent = !trimmed && history.stops.length > 0;
  const results = planner && trimmed ? planner.searchStations(trimmed, 8) : showingRecent ? history.stops : [];

  useEffect(() => setHighlight(0), [trimmed]);

  const choose = (station) => {
    addRecentStop(station.name);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
    onSelectStop(station, planner.linesAtStop(station));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (results.length > 0 && e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (results.length > 0 && e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (results.length > 0 && e.key === 'Enter') {
      e.preventDefault();
      choose(results[highlight]);
    }
  };

  return (
    <div ref={containerRef} className="absolute top-3 left-3 right-3 sm:right-auto sm:top-4 sm:left-4 sm:w-96 z-[1000] ">
      <div data-tour="search" className="surface flex items-center rounded-xl focus-within:border-neutral-400 dark:focus-within:border-white/25">
        <Search className="w-4 h-4 ml-3.5 mr-2 text-neutral-500 shrink-0" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          role="combobox"
          aria-expanded={isOpen && planner !== null && results.length > 0}
          aria-controls="map-stop-search-results"
          aria-label="Search bus stops"
          placeholder="Search bus stops…"
          onFocus={() => {
            setWantsPlanner(true);
            setIsOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full py-2.5 sm:py-3 bg-transparent text-sm text-neutral-800 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {wantsPlanner && !planner && trimmed && <LoaderCircle className="w-4 h-4 mr-3 text-neutral-500 animate-spin shrink-0" />}
        {query && (
          <button
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="p-2 mr-1 text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-200 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && planner && (trimmed || showingRecent) && (
        <div className="surface mt-1.5 rounded-xl overflow-hidden">
        {showingRecent && (
          <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Recent stops</span>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearHistory}
              className="text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
        <ul
          id="map-stop-search-results"
          role="listbox"
          aria-label={showingRecent ? 'Recent stops' : 'Matching stops'}
          className="max-h-72 overflow-y-auto divide-y divide-neutral-100 dark:divide-white/10"
        >
          {results.length > 0 ? (
            results.map((st, i) => {
              const stopLines = planner.linesAtStop(st);
              return (
                <li key={st.index} role="option" aria-selected={i === highlight}>
                  <button
                    onClick={() => choose(st)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2.5 cursor-pointer ${i === highlight ? 'bg-neutral-50 dark:bg-white/[0.06]' : ''}`}
                  >
                    {showingRecent ? <History className="w-4 h-4 text-neutral-500 shrink-0" /> : <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">{st.name}</span>
                      <span className="block text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {st.landmark
                          ? `No bus here · ~${formatWalk(st.walkM)} walk from ${st.stop.name}`
                          : `${stopLines.length} bus route${stopLines.length === 1 ? '' : 's'}: ${stopLines.map((l) => l.label).join(', ')}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className="p-4 text-center text-xs text-neutral-500">No stop on the map matches "{trimmed}".</li>
          )}
        </ul>
        </div>
      )}

      {selected && !isOpen && (
        <div className="surface mt-1.5 p-3 rounded-xl text-neutral-800 dark:text-neutral-100">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{selected.station.name}</div>
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {selected.station.landmark
                  ? `No bus stops here. Nearest stop: ${selected.station.stop.name}, ~${formatWalk(selected.station.walkM)} walk. Its buses:`
                  : `${selected.lines.length} bus route${selected.lines.length === 1 ? '' : 's'} stop here · tap one to see it`}
              </div>
            </div>
            <button onClick={onClear} aria-label="Close stop details" className="p-0.5 rounded text-neutral-500 hover:text-neutral-700 dark:hover:text-white cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {selected.lines.map((line) => (
              <LineBadge key={line.svgId} line={line} onClick={() => onShowLine(line)} />
            ))}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onDirectionsFrom(selected.station)}
              className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-neutral-200 dark:border-white/15 text-xs font-semibold hover:bg-neutral-50 dark:hover:bg-white/[0.06] cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-emerald-600" /> Directions from here
            </button>
            <button
              onClick={() => onDirectionsTo(selected.station)}
              className="btn-primary flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" /> Directions to here
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
