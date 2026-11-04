import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MonitorSmartphone, Share } from 'lucide-react';
import { useInstallPrompt } from '../offline';
import { snoozeInstallCard } from './InstallCard';

// "How to use" tour: a few cards, each with a small looping SVG scene of the real UI. Opens by itself on a first
// plain visit (not from a shared link) and again from the ? button. Seen-state lives in localStorage; bump the
// key's version to show the tour once more after a big feature lands.

const SEEN_KEY = 'ktm_tour_v1';

export const isTourSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === 'done';
  } catch {
    return false;
  }
};

const markTourSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, 'done');
  } catch {}
};

// "Show me": ring the real control for a few seconds. Targets are the data-tour attributes in the app.
const PULSE_MS = 2800;
export function pulseTarget(name) {
  // After the tour closes (and e.g. the search bar mounts again)
  setTimeout(() => {
    const el = document.querySelector(`[data-tour="${name}"]`);
    if (!el) return;
    el.classList.remove('tour-pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('tour-pulse');
    setTimeout(() => el.classList.remove('tour-pulse'), PULSE_MS);
  }, 80);
}

// --- Scene kit -----------------------------------------------------------------------------------------------
// Every scene is one 6 s loop. Animations are SMIL, so each element carries its own timing and all stay in step.
// With reduced motion no animation renders and each element shows its static attributes: the scene's last frame.

const DUR = '6s';
const REDUCED = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const round = (n) => Math.round(n * 1000) / 1000;
const timing = (frames) => ({
  values: frames.map(([, v]) => v).join(';'),
  keyTimes: frames.map(([t]) => round(t)).join(';'),
  dur: DUR,
  repeatCount: 'indefinite',
});

// frames: [time 0..1, value] pairs, first at 0, last at 1
const Loop = ({ attr, frames }) => (REDUCED ? null : <animate attributeName={attr} {...timing(frames)} />);
const Move = ({ frames, type = 'translate' }) => (REDUCED ? null : <animateTransform attributeName="transform" type={type} {...timing(frames)} />);

const appear = (at) => [[0, 0], [at, 0], [at + 0.04, 1], [1, 1]];
const vanish = (at) => [[0, 1], [at, 1], [at + 0.04, 0], [1, 0]];
const between = (from, to) => [[0, 0], [from, 0], [from + 0.03, 1], [to, 1], [to + 0.03, 0], [1, 0]];
const dim = (at) => [[0, 1], [at, 1], [at + 0.05, 0.15], [1, 0.15]];
// Stroke drawn along the path (pathLength 1, dash 1, gap 1.1: offset 1.05 hides it without a stray round cap)
const draw = (at, len = 0.18) => [[0, 1.05], [at, 1.05], [at + len, 0], [1, 0]];

const RED = '#e11d48';
const BLUE = '#2563eb';
const GREEN = '#16a34a';
const AMBER = '#f59e0b';

// Three lines meeting at one stop (140, 70)
const RED_D = 'M18 122 C 70 120, 90 70, 140 70 C 190 70, 230 22, 272 22';
const BLUE_D = 'M14 18 C 70 30, 110 60, 140 70 C 170 80, 210 110, 262 150';
const GREEN_D = 'M128 168 C 132 130, 140 100, 140 70 C 140 40, 150 24, 160 0';
const TRIP_RED = 'M18 122 C 70 120, 90 70, 140 70';
const TRIP_BLUE = 'M140 70 C 170 80, 210 110, 262 150';
const TRIP_D = 'M18 122 C 70 120, 90 70, 140 70 C 170 80, 210 110, 262 150';

const PANEL = 'fill-white stroke-black/10 dark:fill-neutral-950 dark:stroke-white/15';
const STRONG = 'fill-neutral-900 dark:fill-white';
const MUTED = 'fill-neutral-500 dark:fill-neutral-400';
const INK = 'fill-neutral-900 dark:fill-white';

function Scene({ children }) {
  return (
    <svg viewBox="0 0 280 168" className="block w-full h-auto select-none" aria-hidden="true" focusable="false">
      <rect width="280" height="168" className="fill-neutral-50 dark:fill-neutral-900" />
      <g>
        <Loop attr="opacity" frames={[[0, 0], [0.04, 1], [0.94, 1], [1, 0]]} />
        {children}
      </g>
    </svg>
  );
}

function Line({ d, color, width = 3.5, dimAt, drawAt }) {
  const drawn = drawAt != null;
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={dimAt != null ? 0.15 : undefined}
      pathLength={drawn ? 1 : undefined}
      strokeDasharray={drawn ? '1 1.1' : undefined}
    >
      {dimAt != null && <Loop attr="opacity" frames={dim(dimAt)} />}
      {drawn && <Loop attr="stroke-dashoffset" frames={draw(drawAt)} />}
    </path>
  );
}

const Stop = ({ x, y, r = 4.5 }) => (
  <circle cx={x} cy={y} r={r} strokeWidth="2" className="fill-white stroke-neutral-800 dark:fill-neutral-950 dark:stroke-neutral-200" />
);

function Chip({ x, y, color, label, w = 20 }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height="14" rx="3.5" fill={color} />
      <text x={x + w / 2} y={y + 10} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff" className="font-mono">
        {label}
      </text>
    </g>
  );
}

// A finger press: a dot just before `at`, then a ripple
function Tap({ x, y, at }) {
  if (REDUCED) return null;
  return (
    <g transform={`translate(${x} ${y})`} className={INK}>
      <circle r="5" opacity="0">
        <Loop attr="opacity" frames={[[0, 0], [at - 0.06, 0], [at - 0.04, 0.6], [at + 0.04, 0.6], [at + 0.07, 0], [1, 0]]} />
      </circle>
      <circle r="5" opacity="0">
        <Loop attr="r" frames={[[0, 5], [at, 5], [at + 0.12, 17], [1, 17]]} />
        <Loop attr="opacity" frames={[[0, 0], [at, 0], [at + 0.01, 0.35], [at + 0.12, 0], [1, 0]]} />
      </circle>
    </g>
  );
}

// --- Scenes --------------------------------------------------------------------------------------------------

// Lines draw in, a tap on the red one leaves it alone on the map with its bus code
function WelcomeArt() {
  return (
    <Scene>
      <Line d={BLUE_D} color={BLUE} drawAt={0.04} dimAt={0.5} />
      <Line d={GREEN_D} color={GREEN} drawAt={0.1} dimAt={0.5} />
      <Line d={RED_D} color={RED} drawAt={0.16} />
      <Stop x={140} y={70} />
      <Tap x={80} y={95} at={0.44} />
      <g>
        <Loop attr="opacity" frames={appear(0.5)} />
        <rect x="52" y="60" width="66" height="22" rx="6" className={PANEL} />
        <Chip x={56} y={64} color={RED} label="S2" />
        <text x="81" y="74.5" fontSize="8.5" fontWeight="500" className={MUTED}>
          Sajha
        </text>
      </g>
    </Scene>
  );
}

// Type a stop name, pick the result, the map pins it and lists its buses
function SearchArt() {
  const clipId = `tour-type-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Scene>
      <g opacity="0.35">
        <Line d={BLUE_D} color={BLUE} />
        <Line d={GREEN_D} color={GREEN} />
        <Line d={RED_D} color={RED} />
      </g>

      <g transform="translate(140 70)">
        <Loop attr="opacity" frames={appear(0.68)} />
        <g>
          <Move frames={[[0, '0 -12'], [0.68, '0 -12'], [0.74, '0 0'], [1, '0 0']]} />
          <circle r="5.5" strokeWidth="2" className="fill-neutral-900 stroke-white dark:fill-white dark:stroke-neutral-900" />
          <rect x="10" y="-9" width="58" height="18" rx="5" className={PANEL} />
          <text x="16" y="3.5" fontSize="9" fontWeight="600" className={STRONG}>
            Lagankhel
          </text>
        </g>
      </g>

      <rect x="12" y="12" width="256" height="28" rx="8" className={PANEL} />
      <g fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-neutral-500">
        <circle cx="27" cy="25" r="4.5" />
        <path d="M30.5 28.5 L34 32" />
      </g>
      <text x="42" y="29.5" fontSize="10" opacity="0" className={MUTED}>
        Search bus stops…
        <Loop attr="opacity" frames={vanish(0.12)} />
      </text>
      <clipPath id={clipId}>
        <rect x="42" y="14" width="80" height="24">
          <Loop attr="width" frames={[[0, 0], [0.14, 0], [0.32, 80], [1, 80]]} />
        </rect>
      </clipPath>
      <text x="42" y="29.5" fontSize="10" fontWeight="500" className={STRONG} clipPath={`url(#${clipId})`}>
        Lagankhel
      </text>

      <g opacity="0">
        <Loop attr="opacity" frames={between(0.3, 0.6)} />
        <rect x="12" y="44" width="256" height="52" rx="8" className={PANEL} />
        <rect x="16" y="48" width="248" height="22" rx="5" opacity="0" className="fill-neutral-100 dark:fill-white/10">
          <Loop attr="opacity" frames={appear(0.5)} />
        </rect>
        <text x="26" y="62.5" fontSize="9.5" fontWeight="600" className={STRONG}>
          Lagankhel
        </text>
        <Chip x={196} y={52} color={RED} label="S2" />
        <Chip x={218} y={52} color={BLUE} label="21" />
        <Chip x={240} y={52} color={GREEN} label="M2" />
        <text x="26" y="86" fontSize="9.5" className={MUTED}>
          Lagankhel Buspark
        </text>
      </g>
      <Tap x={90} y={59} at={0.52} />

      <g>
        <Loop attr="opacity" frames={appear(0.76)} />
        <rect x="12" y="120" width="256" height="38" rx="8" className={PANEL} />
        <text x="22" y="136" fontSize="10" fontWeight="600" className={STRONG}>
          Lagankhel
        </text>
        <text x="22" y="150" fontSize="8.5" className={MUTED}>
          3 buses stop here
        </text>
        <Chip x={196} y={132} color={RED} label="S2" />
        <Chip x={218} y={132} color={BLUE} label="21" />
        <Chip x={240} y={132} color={GREEN} label="M2" />
      </g>
    </Scene>
  );
}

// Tap the stop, its card slides up, pick one bus to see only its line
function StopArt() {
  return (
    <Scene>
      <Line d={RED_D} color={RED} dimAt={0.6} />
      <Line d={GREEN_D} color={GREEN} dimAt={0.6} />
      <Line d={BLUE_D} color={BLUE} />
      <Stop x={140} y={70} r={5} />
      <circle cx="140" cy="70" r="10" fill="none" strokeWidth="2" className="stroke-neutral-900 dark:stroke-white">
        <Loop attr="opacity" frames={appear(0.18)} />
      </circle>
      <Tap x={140} y={70} at={0.14} />

      <g>
        <Move frames={[[0, '0 72'], [0.22, '0 72'], [0.3, '0 0'], [1, '0 0']]} />
        <rect x="12" y="102" width="256" height="56" rx="9" className={PANEL} />
        <text x="22" y="119" fontSize="10" fontWeight="600" className={STRONG}>
          Lagankhel
        </text>
        <text x="258" y="119" textAnchor="end" fontSize="8" className={MUTED}>
          3 buses stop here
        </text>
        <Chip x={22} y={128} color={RED} label="S2" />
        <Chip x={46} y={128} color={BLUE} label="21" />
        <Chip x={70} y={128} color={GREEN} label="M2" />
        <rect x="43.5" y="125.5" width="25" height="19" rx="5" fill="none" strokeWidth="1.5" className="stroke-neutral-900 dark:stroke-white">
          <Loop attr="opacity" frames={appear(0.58)} />
        </rect>
        <rect x="160" y="127" width="50" height="16" rx="8" className={PANEL} />
        <text x="185" y="138" textAnchor="middle" fontSize="7.5" fontWeight="600" className={STRONG}>
          Start here
        </text>
        <rect x="214" y="127" width="46" height="16" rx="8" className={INK} />
        <text x="237" y="138" textAnchor="middle" fontSize="7.5" fontWeight="600" className="fill-white dark:fill-neutral-900">
          Go here
        </text>
      </g>
      <Tap x={56} y={135} at={0.55} />
    </Scene>
  );
}

// From (GPS) and To, then the trip draws: board, change, get off, and the bus rides it
function TripArt() {
  return (
    <Scene>
      <g opacity="0.25">
        <Line d={BLUE_D} color={BLUE} />
        <Line d={GREEN_D} color={GREEN} />
        <Line d={RED_D} color={RED} />
      </g>
      <Line d={TRIP_RED} color={RED} width={4.5} drawAt={0.34} />
      <Line d={TRIP_BLUE} color={BLUE} width={4.5} drawAt={0.5} />

      <g>
        <Loop attr="opacity" frames={appear(0.34)} />
        <circle cx="18" cy="122" r="5" fill={GREEN} stroke="#fff" strokeWidth="1.5" />
        <text x="10" y="140" fontSize="8" fontWeight="600" className={STRONG}>
          Board S2
        </text>
      </g>
      <g>
        <Loop attr="opacity" frames={appear(0.5)} />
        <circle cx="140" cy="70" r="5" fill={AMBER} stroke="#fff" strokeWidth="1.5" />
        <text x="148" y="64" fontSize="8" fontWeight="600" className={STRONG}>
          Change to 21
        </text>
      </g>
      <g>
        <Loop attr="opacity" frames={appear(0.68)} />
        <circle cx="262" cy="150" r="5" fill={RED} stroke="#fff" strokeWidth="1.5" />
        <text x="254" y="140" textAnchor="end" fontSize="8" fontWeight="600" className={STRONG}>
          Get off
        </text>
      </g>
      {!REDUCED && (
        <g opacity="0">
          <Loop attr="opacity" frames={between(0.34, 0.7)} />
          <animateMotion path={TRIP_D} keyPoints="0;0;1;1" keyTimes="0;0.34;0.7;1" calcMode="linear" dur={DUR} repeatCount="indefinite" />
          <rect x="-6" y="-4" width="12" height="8" rx="2" strokeWidth="1.5" className="fill-neutral-900 stroke-white dark:fill-white dark:stroke-neutral-900" />
        </g>
      )}

      <rect x="12" y="10" width="256" height="46" rx="8" className={PANEL} />
      <path d="M32 33 H 258" strokeWidth="1" className="stroke-black/10 dark:stroke-white/15" />
      <circle cx="23" cy="22" r="3.5" fill={GREEN} />
      <text x="32" y="25.5" fontSize="8" className={MUTED}>
        From
      </text>
      <text x="58" y="25.5" fontSize="9.5" fontWeight="600" className={STRONG}>
        Near Jawalakhel
        <Loop attr="opacity" frames={appear(0.12)} />
      </text>
      <g fill="none" strokeWidth="1.4" className="stroke-neutral-500">
        <circle cx="252" cy="22" r="4" />
        <path d="M252 15.5 V 17.5 M252 26.5 V 28.5 M245.5 22 H 247.5 M256.5 22 H 258.5" />
      </g>
      <Tap x={252} y={22} at={0.08} />
      <circle cx="23" cy="44" r="3.5" fill={RED} />
      <text x="32" y="47.5" fontSize="8" className={MUTED}>
        To
      </text>
      <text x="58" y="47.5" fontSize="9.5" fontWeight="600" className={STRONG}>
        Ratnapark
        <Loop attr="opacity" frames={appear(0.24)} />
      </text>
      <Tap x={120} y={45} at={0.2} />

      <g>
        <Loop attr="opacity" frames={appear(0.76)} />
        <rect x="60" y="138" width="152" height="22" rx="6" className={PANEL} />
        <Chip x={66} y={142} color={RED} label="S2" w={18} />
        <text x="89" y="152.5" fontSize="8.5" className={MUTED}>
          →
        </text>
        <Chip x={99} y={142} color={BLUE} label="21" w={18} />
        <text x="124" y="152.5" fontSize="8" className={MUTED}>
          28 min · 1 change
        </text>
      </g>
    </Scene>
  );
}

// Browser menu → Add to Home Screen → the app icon pops onto the home screen
function InstallArt() {
  const iconClip = `tour-icon-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const apps = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) apps.push([113 + col * 21, 22 + row * 24]);
  }
  return (
    <Scene>
      <rect x="104" y="6" width="72" height="156" rx="12" strokeWidth="1.5" className={PANEL} />

      <g opacity="0">
        <Loop attr="opacity" frames={vanish(0.5)} />
        <rect x="112" y="15" width="56" height="9" rx="4.5" className="fill-neutral-100 dark:fill-white/10" />
        <path d="M112 112 C 125 100, 130 82, 140 76 S 160 52, 170 46" fill="none" stroke={RED} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M112 40 C 125 56, 134 70, 140 76 S 156 100, 170 122" fill="none" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
        <g fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="stroke-neutral-600 dark:stroke-neutral-300">
          <path d="M136 147 V 151 H 144 V 147" />
          <path d="M140 149 V 141.5 M137.5 144 L 140 141.5 L 142.5 144" />
        </g>
        <Tap x={140} y={147} at={0.12} />
        <g opacity="0">
          <Loop attr="opacity" frames={appear(0.16)} />
          <Move frames={[[0, '0 30'], [0.16, '0 30'], [0.22, '0 0'], [1, '0 0']]} />
          <rect x="108" y="96" width="64" height="46" rx="6" className={PANEL} />
          <text x="114" y="110" fontSize="6.5" className={MUTED}>
            Copy link
          </text>
          <rect x="110" y="117" width="60" height="17" rx="4" opacity="0" className="fill-neutral-100 dark:fill-white/10">
            <Loop attr="opacity" frames={appear(0.34)} />
          </rect>
          <rect x="114" y="122" width="7" height="7" rx="1.5" fill="none" strokeWidth="1" className="stroke-neutral-700 dark:stroke-neutral-200" />
          <path d="M117.5 123.8 V 127.2 M115.8 125.5 H 119.2" strokeWidth="1" className="stroke-neutral-700 dark:stroke-neutral-200" />
          <text x="124" y="127.8" fontSize="5.8" fontWeight="600" className={STRONG}>
            Add to Home Screen
          </text>
        </g>
        <Tap x={140} y={126} at={0.32} />
      </g>

      <g>
        <Loop attr="opacity" frames={appear(0.5)} />
        {apps.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="14" height="14" rx="3.5" className="fill-neutral-200 dark:fill-white/15" />
        ))}
        <g transform="translate(120 125)">
          <g>
            <Move type="scale" frames={[[0, '0'], [0.56, '0'], [0.62, '1.2'], [0.66, '1'], [1, '1']]} />
            <clipPath id={iconClip}>
              <rect x="-7" y="-7" width="14" height="14" rx="3.5" />
            </clipPath>
            <image href="./icons/apple-touch-icon.png" x="-7" y="-7" width="14" height="14" clipPath={`url(#${iconClip})`} />
            <rect x="-7" y="-7" width="14" height="14" rx="3.5" fill="none" strokeWidth="0.75" className="stroke-black/10 dark:stroke-white/25" />
          </g>
          <text y="16" textAnchor="middle" fontSize="5.5" fontWeight="600" className={STRONG}>
            Bus Map
            <Loop attr="opacity" frames={appear(0.62)} />
          </text>
        </g>
      </g>
    </Scene>
  );
}

// --- Tour ----------------------------------------------------------------------------------------------------

const STEPS = [
  {
    key: 'welcome',
    title: 'Every bus in the valley, on one map',
    body: 'Pinch or scroll to zoom. Tap any coloured line to see which bus runs on it.',
    Art: WelcomeArt,
  },
  {
    key: 'search',
    title: 'Search for a stop',
    body: 'Type a stop name in the search bar at the top and pick it. The map takes you there and lists the buses that stop there.',
    Art: SearchArt,
    target: 'search',
  },
  {
    key: 'stop',
    title: 'See the buses at a stop',
    body: 'Tap a stop on the map. A card lists every bus that stops there. Tap one to see its route, or use Start here and Go here to plan a trip.',
    Art: StopArt,
  },
  {
    key: 'trip',
    title: 'Find your bus',
    body: 'Tap the arrow button, then pick where you are and where you are going. The location button starts from where you stand. You get the bus to board, where to change and where to get off.',
    Art: TripArt,
    target: 'trip',
  },
];

const INSTALL_STEP = { key: 'install', title: 'Add it to your home screen', Art: InstallArt };

export default function HelpTour({ onClose, onShowMe }) {
  const { canInstall, showIOSHint, installed, install } = useInstallPrompt();
  const steps = installed ? STEPS : [...STEPS, INSTALL_STEP];
  const [index, setIndex] = useState(0);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current];
  const isLast = current === steps.length - 1;
  const dialogRef = useRef(null);
  const touchRef = useRef(null);
  const titleId = useId();

  const close = () => {
    markTourSeen();
    onClose();
  };
  const next = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));

  // The tour already shows how to install: don't ask again with the floating card
  useEffect(() => {
    if (step.key === 'install') snoozeInstallCard();
  }, [step.key]);

  // Focus moves into the dialog and back to where it was (the ? button) on close
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
      else if (e.key === 'Tab') {
        // Keep focus inside the dialog
        const items = [...dialogRef.current.querySelectorAll('button:not([disabled])')];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Swipe between steps on touch screens
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(t.clientY - start.y)) (dx < 0 ? next : back)();
  };

  const installBody = canInstall ? (
    'Install it like an app: it opens full screen and works without internet.'
  ) : showIOSHint ? (
    <>
      In Safari, tap <Share className="inline w-3.5 h-3.5 -mt-0.5" aria-label="Share" /> Share, then <b className="font-semibold">Add to Home Screen</b>. It opens like an app and works without internet.
    </>
  ) : (
    <>
      Open your browser menu and choose <b className="font-semibold">Install app</b> or <b className="font-semibold">Add to Home screen</b>. It opens like an app and works without internet.
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center sm:p-6 bg-black/40 backdrop-blur-[2px] animate-[tour-fade_0.2s_ease-out]"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 text-neutral-800 dark:text-neutral-100 focus:outline-none animate-[tour-in_0.25s_ease-out]"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            {current + 1} of {steps.length}
          </span>
          <button
            onClick={close}
            className="px-2 py-1 -mr-1 rounded-md text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/[0.07] cursor-pointer"
          >
            {isLast ? 'Close' : 'Skip'}
          </button>
        </div>

        <div className="rounded-xl overflow-hidden border border-black/5 dark:border-white/10">
          <step.Art key={step.key} />
        </div>

        <div aria-live="polite" className="min-h-[7.5rem]">
          <h2 id={titleId} className="mt-4 text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
            {step.title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">
            {step.key === 'install' ? installBody : step.body}
          </p>
          {step.target && (
            <button
              onClick={() => {
                markTourSeen();
                onShowMe(step.target);
              }}
              className="mt-2 text-[13px] font-medium text-neutral-900 dark:text-white underline underline-offset-4 decoration-neutral-300 hover:decoration-neutral-900 dark:decoration-white/30 dark:hover:decoration-white cursor-pointer"
            >
              Show me
            </button>
          )}
          {step.key === 'install' && canInstall && (
            <button
              onClick={async () => {
                if ((await install()) === 'accepted') close();
              }}
              className="btn-primary mt-3 h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <MonitorSmartphone className="w-3.5 h-3.5" />
              Install app
            </button>
          )}
          {isLast && (
            <p className="mt-3 text-[11px] text-neutral-500 dark:text-neutral-400">You can open this guide again with the ? button.</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setIndex(i)}
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === current ? 'step' : undefined}
                className="p-1 cursor-pointer"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    i === current ? 'w-4 bg-neutral-900 dark:bg-white' : 'w-1.5 bg-neutral-300 dark:bg-white/25'
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {current > 0 && (
              <button
                onClick={back}
                aria-label="Back"
                className="h-9 w-9 rounded-lg flex items-center justify-center border border-neutral-200 dark:border-white/15 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={isLast ? close : next}
              className="btn-primary h-9 pl-4 pr-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              {isLast ? 'Done' : 'Next'}
              {!isLast && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
