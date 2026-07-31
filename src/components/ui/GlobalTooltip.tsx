import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Global fast tooltips: the browser's native title delay (~1s) is fixed and
// sluggish. This layer watches every [title] in the app, shows a styled tip
// after 350ms, and suppresses the native one by stashing the attribute
// while hovered. The attribute is restored on mouseout AND on mousedown —
// so anything that queries [title=...] right after a click (tests,
// accessibility tools) always finds it in place.

const SHOW_DELAY_MS = 350;

interface Tip {
  text: string;
  x: number;
  top: number;
  bottom: number;
  above: boolean;
}

export default function GlobalTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;

    const restore = () => {
      if (current?.dataset.tipStash !== undefined) {
        current.setAttribute('title', current.dataset.tipStash);
        delete current.dataset.tipStash;
      }
    };
    const clear = () => {
      window.clearTimeout(timer);
      restore();
      current = null;
      setTip(null);
    };

    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip-stash]') as HTMLElement | null;
      if (!el || el === current) return;
      clear();
      const text = el.getAttribute('title') ?? el.dataset.tipStash ?? '';
      if (!text.trim()) return;
      current = el;
      el.dataset.tipStash = text;
      el.removeAttribute('title');
      timer = window.setTimeout(() => {
        if (current !== el || !el.isConnected) return;
        el.removeAttribute('title'); // a React re-render may have put it back
        const rect = el.getBoundingClientRect();
        const above = rect.bottom > window.innerHeight - 96;
        setTip({
          text,
          x: Math.max(12, Math.min(rect.left + rect.width / 2, window.innerWidth - 12)),
          top: rect.top,
          bottom: rect.bottom,
          above,
        });
      }, SHOW_DELAY_MS);
    };

    const out = (e: MouseEvent) => {
      if (!current) return;
      const to = e.relatedTarget;
      if (to instanceof Node && current.contains(to)) return;
      if (e.target instanceof Node && (current === e.target || current.contains(e.target))) clear();
    };

    // capture phase: the title is back BEFORE any click handler or
    // re-render runs, so post-click attribute queries never miss
    const down = () => clear();

    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('mousedown', down, true);
    document.addEventListener('scroll', down, true);
    window.addEventListener('blur', down);
    return () => {
      clear();
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('scroll', down, true);
      window.removeEventListener('blur', down);
    };
  }, []);

  if (!tip) return null;
  return <TipBox tip={tip} />;
}

// Measured clamping: centering on the anchor alone lets long tips bleed
// off-screen for edge buttons (left palette, right rail). Render, measure,
// shove the box fully back inside — before paint, so nothing flashes.
function TipBox({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(tip.x);
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    const half = w / 2;
    setX(Math.max(12 + half, Math.min(tip.x, window.innerWidth - 12 - half)));
  }, [tip]);
  return createPortal(
    <div
      ref={ref}
      className="tdag-tooltip"
      style={{
        left: x,
        top: tip.above ? tip.top - 8 : tip.bottom + 8,
        transform: `translate(-50%, ${tip.above ? '-100%' : '0'})`,
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
