import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// One styled tooltip for the whole app, in place of the browser's title popups. Any element with data-tip="…" gets
// it on mouse hover or keyboard focus (touch has no hover, same as title). data-tip-side="top|bottom|left|right"
// picks a side; by default tools on the right edge get it on their left, everything else above (below if no room).
// The text is read live, so a tip that changes while shown (Share → "Link copied") updates in place.

const SHOW_DELAY_MS = 400;
const SKIP_DELAY_MS = 300; // moving straight from one tool to the next shows its tip at once
const GAP = 8;
const EDGE = 8;
const TIP_ID = 'ktm-tooltip';

function place(anchor, box, preferred) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let side = preferred || (anchor.right > vw - 72 ? 'left' : 'top');
  if (side === 'top' && anchor.top - box.height - GAP < EDGE) side = 'bottom';
  if (side === 'bottom' && anchor.bottom + box.height + GAP > vh - EDGE) side = 'top';
  if (side === 'left' && anchor.left - box.width - GAP < EDGE) side = 'top';
  if (side === 'right' && anchor.right + box.width + GAP > vw - EDGE) side = 'top';

  const centerX = anchor.left + anchor.width / 2 - box.width / 2;
  const centerY = anchor.top + anchor.height / 2 - box.height / 2;
  const at = {
    top: [centerX, anchor.top - box.height - GAP],
    bottom: [centerX, anchor.bottom + GAP],
    left: [anchor.left - box.width - GAP, centerY],
    right: [anchor.right + GAP, centerY],
  }[side];
  const clamp = (v, size, max) => Math.min(Math.max(v, EDGE), max - size - EDGE);
  return { x: clamp(at[0], box.width, vw), y: clamp(at[1], box.height, vh), side };
}

export default function Tooltips() {
  const [tip, setTip] = useState(null); // { el, text }
  const [pos, setPos] = useState(null);
  const tipRef = useRef(null);

  useEffect(() => {
    let current = null; // element under the pointer / focus that has a tip
    let observer = null;
    let timer = 0;
    let visible = false;
    let hiddenAt = 0;

    const show = (el) => {
      if (el !== current || !el.isConnected || !el.dataset.tip) return;
      visible = true;
      setTip({ el, text: el.dataset.tip });
    };
    const hideOnly = () => {
      clearTimeout(timer);
      if (visible) hiddenAt = performance.now();
      visible = false;
      setTip(null);
    };
    const leave = () => {
      hideOnly();
      observer?.disconnect();
      observer = null;
      current = null;
    };
    const enter = (el) => {
      if (el === current) return;
      leave();
      current = el;
      observer = new MutationObserver(() => (el.dataset.tip ? show(el) : hideOnly()));
      observer.observe(el, { attributes: true, attributeFilter: ['data-tip'] });
      timer = setTimeout(() => show(el), performance.now() - hiddenAt < SKIP_DELAY_MS ? 0 : SHOW_DELAY_MS);
    };

    const onPointerOver = (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest?.('[data-tip]');
      if (el) enter(el);
      else if (current) leave();
    };
    const onPointerOut = (e) => !e.relatedTarget && leave(); // left the window
    // A press hides the tip but keeps watching the element: a changed tip ("Link copied") shows as feedback.
    // Clicks often remove the element (a panel closes); drop the tip then.
    const onPointerDown = () => {
      hideOnly();
      setTimeout(() => current && !current.isConnected && leave(), 100);
    };
    const onFocusIn = (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el && e.target.matches(':focus-visible')) enter(el);
    };
    const onFocusOut = () => leave();
    const onKeyDown = (e) => e.key === 'Escape' && hideOnly();

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', leave, true);
    document.addEventListener('wheel', leave, { passive: true });
    window.addEventListener('resize', leave);
    return () => {
      leave();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', leave, true);
      document.removeEventListener('wheel', leave);
      window.removeEventListener('resize', leave);
    };
  }, []);

  // Measure, then place before paint
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return setPos(null);
    setPos(place(tip.el.getBoundingClientRect(), tipRef.current.getBoundingClientRect(), tip.el.dataset.tipSide));
  }, [tip]);

  // Screen readers: the tip describes its element while shown (most tipped controls also have an aria-label)
  useEffect(() => {
    const el = tip?.el;
    if (!el || el.hasAttribute('aria-describedby')) return;
    el.setAttribute('aria-describedby', TIP_ID);
    return () => el.removeAttribute('aria-describedby');
  }, [tip?.el]);

  if (!tip) return null;
  return (
    <div
      ref={tipRef}
      id={TIP_ID}
      role="tooltip"
      data-side={pos?.side}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="tooltip fixed z-[3000] pointer-events-none max-w-[16rem] px-2 py-1 rounded-md text-[11.5px] leading-snug font-medium bg-neutral-900 text-white shadow-lg shadow-black/20 dark:bg-white dark:text-neutral-900 dark:shadow-black/50"
    >
      {tip.text}
    </div>
  );
}
