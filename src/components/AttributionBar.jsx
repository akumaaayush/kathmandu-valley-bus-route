import React from 'react';
import { ExternalLink } from 'lucide-react';

export default function AttributionBar() {
  return (
    <footer
      className="absolute bottom-0 left-0 right-0 z-[950] bg-black/75 backdrop-blur-sm text-neutral-300 text-[10px] sm:text-[11px] py-1 px-3 flex items-center justify-between border-t border-white/10 select-none pointer-events-auto"
      aria-label="Map attribution and credits"
    >
      <div className="flex items-center gap-1.5 sm:gap-2 truncate pr-16 sm:pr-0">
        <span className="text-neutral-400 hidden md:inline">
          Kathmandu Valley Transit Network •
        </span>
        <span className="truncate">
          Map Design &amp; Cartography ©{' '}
          <a
            href="https://www.linkedin.com/in/subham-subedi/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white font-medium hover:underline hover:text-white transition-colors inline-flex items-center gap-0.5"
            data-tip="Subham Subedi on LinkedIn"
          >
            Subham Subedi
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </a>
        </span>
        <span className="text-neutral-400">•</span>
        <a
          href="https://www.linkedin.com/posts/subham-subedi_about-a-year-ago-i-had-this-idea-of-creating-share-7409679335592456193-Qycg"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-300 hover:text-white hover:underline transition-colors shrink-0"
          data-tip="View original map post on LinkedIn"
        >
          Original Post
        </a>
        <span className="text-neutral-400">•</span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-300 hover:text-white hover:underline transition-colors shrink-0"
          data-tip="Stop locations for the trip planner come from OpenStreetMap"
        >
          Stops © OpenStreetMap
        </a>
      </div>

      <div className="hidden lg:flex items-center gap-2 text-neutral-400 text-[10px]">
        <span>Interactive Transit Explorer</span>
      </div>
    </footer>
  );
}
