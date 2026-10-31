import React, { useEffect, useState } from 'react';
import { X, MapPin, ArrowUpRight, Navigation, Flag } from 'lucide-react';
import DockablePanel, { CollapseButton, ShareButton } from './DockablePanel';

// Card for "the buses at this spot": every line found at a tapped point (or stop), across operators.
// Chips switch between lines (tapping several compares them, "All" shows every line). A detail row says where
// the focused line goes: the hovered chip on desktop, the selected line on touch, so phones need no tooltip.

const routeEnds = (line) => line.name.split(':').slice(1).join(':').trim() || line.operator;
const COLLAPSED_CHIPS = 9; // beyond 10 lines, show 9 and a "+N more" chip

export default function SpotBanner({
  spot,
  collapsed,
  onCollapse,
  onExpand,
  onToggleLine,
  onShowAll,
  onShowOperator,
  onStart,
  onGo,
  onShowStopLines,
  onPreview,
  onClose,
}) {
  const { title, lines, selectedIds, stop, stopLines } = spot;
  const moreAtStop = stop && stopLines && stopLines.length > lines.length;
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const isAll = selectedIds.length === 0;
  const selected = lines.filter((l) => selectedIds.includes(l.svgId));
  const single = selected.length === 1 ? selected[0] : null;
  const focus = hovered || single;

  const collapsible = lines.length > COLLAPSED_CHIPS + 1;
  // Keep selected lines visible even when collapsed
  const visible =
    collapsible && !expanded
      ? [...lines.slice(0, COLLAPSED_CHIPS), ...selected.filter((l) => !lines.slice(0, COLLAPSED_CHIPS).includes(l))]
      : lines;

  useEffect(() => {
    // Escape belongs to an open dialog first (the tap card, the legend)
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('[role="dialog"]') && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hover = (line) => {
    setHovered(line);
    onPreview(line);
  };

  // Tab while hidden: the selected line, or the number of lines
  const tab = single ? (
    <span className="px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold" style={{ backgroundColor: single.color, color: '#fff' }}>
      {single.label}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium">
      <MapPin className="w-3.5 h-3.5 text-neutral-400" />
      {selected.length > 0 ? selected.length : lines.length}
    </span>
  );

  return (
    <DockablePanel label={`Bus lines at ${title}`} collapsed={collapsed} onExpand={onExpand} tab={tab}>
      {/* Header */}
      <div className="flex items-center gap-1 pl-3.5 pr-2 pt-2.5">
        <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mr-1" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {title}
          <span className="ml-2 font-normal text-neutral-400">
            {lines.length} bus line{lines.length === 1 ? '' : 's'}
          </span>
        </h2>
        <ShareButton label="Share these lines" title={single ? `${single.label} at ${title}` : `Buses at ${title}`} />
        <CollapseButton onClick={onCollapse} />
        <button
          onClick={onClose}
          aria-label="Clear the lines at this spot"
          className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* At a stop: plan from / to it, or widen to every bus that stops there */}
      {stop && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
          <button
            onClick={() => onStart(stop)}
            className="flex items-center gap-1.5 h-7 [@media(pointer:coarse)]:h-9 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium cursor-pointer transition-colors"
          >
            <Navigation className="w-3.5 h-3.5 text-emerald-400" /> Start here
          </button>
          <button
            onClick={() => onGo(stop)}
            className="btn-primary flex items-center gap-1.5 h-7 [@media(pointer:coarse)]:h-9 px-2.5 rounded-lg text-xs font-medium cursor-pointer"
          >
            <Flag className="w-3.5 h-3.5" /> Go here
          </button>
          {moreAtStop && (
            <button
              onClick={onShowStopLines}
              className="ml-auto h-7 [@media(pointer:coarse)]:h-9 px-2 rounded-lg text-xs text-neutral-300 hover:text-white hover:bg-white/[0.08] cursor-pointer"
            >
              All {stopLines.length} buses at this stop
            </button>
          )}
        </div>
      )}

      {/* Chips: wrap, never scroll sideways */}
      <div role="group" aria-label={`Bus lines at ${title}`} className="flex flex-wrap gap-1.5 px-3 pt-2 pb-2.5" onMouseLeave={() => hover(null)}>
        <button
          onClick={onShowAll}
          aria-pressed={isAll}
          className={`h-7 [@media(pointer:coarse)]:h-9 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
            isAll ? 'bg-white text-neutral-950' : 'bg-white/[0.06] text-neutral-300 hover:text-white hover:bg-white/[0.1]'
          }`}
        >
          All
        </button>
        {visible.map((line) => {
          const isOn = selectedIds.includes(line.svgId);
          return (
            <button
              key={line.svgId}
              onClick={() => onToggleLine(line)}
              onMouseEnter={() => hover(line)}
              onFocus={() => hover(line)}
              onBlur={() => hover(null)}
              aria-pressed={isOn}
              aria-label={`${line.label}, ${line.operator}: ${routeEnds(line)}`}
              className={`h-7 [@media(pointer:coarse)]:h-9 min-w-9 px-2 rounded-lg text-xs font-mono font-semibold whitespace-nowrap cursor-pointer transition-[opacity,box-shadow] duration-150 ring-offset-2 ring-offset-neutral-950 ${
                isOn ? 'ring-2 ring-white' : isAll ? 'hover:ring-1 hover:ring-white/50' : 'opacity-40 hover:opacity-90'
              }`}
              style={{ backgroundColor: line.color, color: '#fff' }}
            >
              {line.label}
            </button>
          );
        })}
        {collapsible && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="h-7 [@media(pointer:coarse)]:h-9 px-2.5 rounded-lg text-xs text-neutral-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] whitespace-nowrap cursor-pointer"
          >
            {expanded ? 'Less' : `+${lines.length - visible.length} more`}
          </button>
        )}
      </div>

      {/* Detail: where the focused line goes */}
      <div className="flex items-center gap-2.5 min-h-12 px-3.5 py-2 border-t border-white/[0.08]" aria-live="polite">
        {focus ? (
          <>
            <span
              className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold"
              style={{ backgroundColor: focus.color, color: '#fff' }}
            >
              {focus.label}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium truncate">{routeEnds(focus)}</span>
              <span className="block text-[11px] text-neutral-400 truncate">{focus.operator}</span>
            </span>
            <button
              onClick={() => onShowOperator(focus)}
              className="shrink-0 flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] text-neutral-300 hover:text-white hover:bg-white/[0.08] whitespace-nowrap cursor-pointer"
            >
              All {focus.operator.replace(/ Yatayat$/, '')} routes <ArrowUpRight className="w-3 h-3" />
            </button>
          </>
        ) : (
          <span className="text-xs text-neutral-400">
            {isAll ? 'Showing every line here. Pick one to see where it goes.' : `${selected.length} lines selected. Hover one to see where it goes.`}
          </span>
        )}
      </div>
    </DockablePanel>
  );
}
