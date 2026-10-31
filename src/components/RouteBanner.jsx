import React, { useState } from 'react';
import { X } from 'lucide-react';
import DockablePanel, { CollapseButton, ShareButton } from './DockablePanel';

// One operator's routes: branch chips (tap one to isolate it, tap more to compare, "All" for every branch) and a
// detail row with where the focused branch goes. Same left-docked panel as the spot card.

const branchName = (sr) => (sr.name.split(':')[1] || sr.name).trim();

export default function RouteBanner({ route, subRoutes, selectedCodes, collapsed, onCollapse, onExpand, onToggle, onShowAll, onPreview, onClear }) {
  const [hovered, setHoveredState] = useState(null);
  // Hovering a chip previews that branch on the map; leaving puts the selection back
  const setHovered = (sr) => {
    setHoveredState(sr);
    onPreview(sr);
  };
  const isAll = selectedCodes.length === 0;
  const selected = subRoutes.filter((sr) => selectedCodes.includes(sr.code));
  const single = selected.length === 1 ? selected[0] : null;
  const focus = hovered || single;

  const summary = subRoutes.length === 0 ? route.corridor : isAll ? `All ${subRoutes.length} routes` : single ? single.code : `${selected.length} of ${subRoutes.length} routes`;

  const tab = (
    <span className="flex items-center gap-1.5 text-xs font-medium">
      <span className="w-5 h-5 rounded-md flex items-center justify-center font-mono text-[11px] font-semibold" style={{ backgroundColor: route.color }}>
        {route.code}
      </span>
      {single ? single.code : isAll ? subRoutes.length || '' : selected.length}
    </span>
  );

  return (
    <DockablePanel label={`${route.name} routes`} collapsed={collapsed} onExpand={onExpand} tab={tab}>
      {/* Header */}
      <div className="flex items-center gap-1 pl-3 pr-2 pt-2.5">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-semibold text-xs shrink-0 mr-1.5"
          style={{ backgroundColor: route.color }}
        >
          {route.code}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {route.name}
          <span className="ml-2 font-normal text-neutral-400">{subRoutes.length > 0 && summary}</span>
        </h2>
        <ShareButton label="Share these routes" title={single ? `${single.code}: ${branchName(single)}` : `${route.name} routes`} />
        <CollapseButton onClick={onCollapse} />
        <button
          onClick={onClear}
          aria-label="Clear route highlight"
          className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Branch chips: wrap, never scroll sideways */}
      {subRoutes.length > 0 && (
        <div role="group" aria-label={`${route.name} routes`} className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-2.5" onMouseLeave={() => setHovered(null)}>
          <button
            onClick={onShowAll}
            aria-pressed={isAll}
            className={`h-7 [@media(pointer:coarse)]:h-9 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
              isAll ? 'bg-white text-neutral-950' : 'bg-white/[0.06] text-neutral-300 hover:text-white hover:bg-white/[0.1]'
            }`}
          >
            All
          </button>
          {subRoutes.map((sr) => {
            const isOn = selectedCodes.includes(sr.code);
            return (
              <button
                key={sr.code}
                onClick={() => onToggle(sr)}
                onMouseEnter={() => setHovered(sr)}
                onFocus={() => setHovered(sr)}
                onBlur={() => setHovered(null)}
                aria-pressed={isOn}
                aria-label={`${sr.code}: ${branchName(sr)}`}
                className={`h-7 [@media(pointer:coarse)]:h-9 min-w-9 px-2 rounded-lg text-xs font-mono font-semibold whitespace-nowrap cursor-pointer transition-[opacity,box-shadow] duration-150 ring-offset-2 ring-offset-neutral-950 ${
                  isOn ? 'ring-2 ring-white' : isAll ? 'hover:ring-1 hover:ring-white/50' : 'opacity-40 hover:opacity-90'
                }`}
                style={{ backgroundColor: route.color, color: '#fff' }}
              >
                {sr.code}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail: where the focused branch goes */}
      <div
        className={`flex items-start gap-2.5 min-h-12 px-3.5 py-2.5 ${subRoutes.length > 0 ? 'border-t border-white/[0.08]' : 'pt-2'}`}
        aria-live="polite"
      >
        {focus ? (
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              <span className="font-mono text-neutral-400 mr-1.5">{focus.code}</span>
              {branchName(focus)}
            </span>
            {focus.description && <span className="block mt-0.5 text-[11px] leading-relaxed text-neutral-400 line-clamp-2">{focus.description}</span>}
          </span>
        ) : (
          <span className="text-xs text-neutral-400 leading-relaxed">
            {subRoutes.length === 0
              ? route.corridor
              : isAll
              ? `Showing all ${subRoutes.length} routes. Pick one to see where it goes.`
              : `${selected.length} routes selected. Hover one to see where it goes.`}
          </span>
        )}
      </div>
    </DockablePanel>
  );
}
