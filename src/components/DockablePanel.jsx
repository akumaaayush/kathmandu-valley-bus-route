import React, { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Share2, Check } from 'lucide-react';
import { shareLink } from '../shareLink';

// Left-docked panel for route views (the spot card, the operator banner). It sits under the search bar, full
// width on phones and a 24rem column on wider screens, so the middle of the map stays clear. « slides it off
// to the left edge, leaving a small tab (summary + ») that slides it back.

const TOP = 'top-[4.25rem] sm:top-[4.75rem]';
const SLIDE = 'transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none';

export function CollapseButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Hide panel"
      title="Hide panel"
      className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
    >
      <ChevronsLeft className="w-4 h-4" />
    </button>
  );
}

// The URL always mirrors what the panel shows (see shareLink.js), so this shares it as-is
export function ShareButton({ label, title }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      onClick={async () => {
        if ((await shareLink(window.location.href, `${title} · Kathmandu bus map`)) === 'copied') setCopied(true);
      }}
      aria-label={copied ? 'Link copied' : label}
      title={copied ? 'Link copied' : label}
      className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
    </button>
  );
}

export default function DockablePanel({ label, collapsed, onExpand, tab, children }) {
  return (
    <>
      <section
        aria-label={label}
        inert={collapsed}
        className={`dark surface absolute z-[990] ${TOP} left-3 right-3 sm:right-auto sm:left-4 sm:w-96 max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain rounded-2xl text-white ${SLIDE} ${
          collapsed ? '-translate-x-[calc(100%+1.5rem)] opacity-0' : ''
        }`}
      >
        {children}
      </section>

      {/* Tab on the left edge while the panel is hidden */}
      <button
        onClick={onExpand}
        inert={!collapsed}
        aria-label={`Show ${label}`}
        className={`dark surface absolute z-[990] ${TOP} left-0 flex items-center gap-1.5 h-11 [@media(pointer:coarse)]:h-12 pl-2.5 pr-1.5 rounded-l-none rounded-r-xl border-l-0 text-white cursor-pointer ${SLIDE} ${
          collapsed ? '' : '-translate-x-full opacity-0'
        }`}
      >
        {tab}
        <ChevronsRight className="w-4 h-4 text-neutral-400" />
      </button>
    </>
  );
}
