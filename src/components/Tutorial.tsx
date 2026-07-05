import { X } from 'lucide-react';
import { useUiStore } from '../lib/ui-store';
import { useT } from '../i18n';
import { COLORS } from '../lib/constants';

// Miniature diagrams for each concept — same visual language as the canvas:
// solid accent chain, dashed warm branch, cards as rounded rects.
function Card({ x, y, w = 34, h = 20, tone = 'plain' }: { x: number; y: number; w?: number; h?: number; tone?: 'plain' | 'accent' | 'warm' }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="white" stroke={COLORS.line} strokeWidth={1} />
      {tone !== 'plain' && (
        <rect x={x} y={y} width={2.5} height={h} rx={1.25} fill={tone === 'accent' ? COLORS.accent : COLORS.warm} />
      )}
    </g>
  );
}

const DIAGRAMS: Record<number, React.ReactNode> = {
  1: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      <Card x={43} y={32} tone="accent" />
      <circle cx={60} cy={28} r={2.5} fill={COLORS.accent} />
    </svg>
  ),
  2: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      <Card x={43} y={12} tone="accent" />
      <line x1={60} y1={32} x2={60} y2={50} stroke={COLORS.accent} strokeWidth={1.75} />
      <path d={`M 57 47 L 60 52 L 63 47 Z`} fill={COLORS.accent} />
      <Card x={43} y={52} />
    </svg>
  ),
  3: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      <Card x={20} y={12} tone="accent" />
      <line x1={37} y1={32} x2={37} y2={50} stroke={COLORS.accent} strokeWidth={1.75} />
      <path d={`M 34 47 L 37 52 L 40 47 Z`} fill={COLORS.accent} />
      <Card x={20} y={52} />
      <rect x={26} y={58} width={14} height={3} rx={1.5} fill={COLORS.trace} opacity={0.6} />
      <path d="M 54 62 C 64 62, 62 40, 72 38" stroke={COLORS.warm} strokeWidth={1.75} fill="none" strokeDasharray="4 3" />
      <path d={`M 69 35.5 L 74 38 L 70 41 Z`} fill={COLORS.warm} />
      <Card x={74} y={28} tone="warm" />
    </svg>
  ),
  4: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      <Card x={43} y={10} tone="accent" />
      <line x1={60} y1={30} x2={60} y2={52} stroke={COLORS.line} strokeWidth={1.75} strokeDasharray="3 3" />
      <circle cx={60} cy={41} r={7} fill="white" stroke="#FCA5A5" strokeWidth={1} />
      <line x1={57} y1={38} x2={63} y2={44} stroke="#EF4444" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={63} y1={38} x2={57} y2={44} stroke="#EF4444" strokeWidth={1.5} strokeLinecap="round" />
      <Card x={43} y={54} />
    </svg>
  ),
  5: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      <Card x={30} y={18} w={60} h={34} tone="accent" />
      <rect x={38} y={26} width={30} height={3.5} rx={1.75} fill={COLORS.trace} opacity={0.55} />
      <rect x={38} y={33} width={44} height={3.5} rx={1.75} fill={COLORS.line} />
      <rect x={38} y={40} width={38} height={3.5} rx={1.75} fill={COLORS.line} />
      <text x={60} y={68} textAnchor="middle" fontSize={7} fill={COLORS.inkMuted} fontFamily="JetBrains Mono Variable, monospace">~92 tok · 6 msgs</text>
    </svg>
  ),
};

export default function Tutorial() {
  const open = useUiStore((s) => s.tutorialOpen);
  const setOpen = useUiStore((s) => s.setTutorialOpen);
  const t = useT();

  if (!open) return null;

  const steps = [1, 2, 3, 4, 5] as const;

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/25 flex items-center justify-center animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-card border border-line rounded-xl shadow-xl w-[640px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-ink tracking-tight">{t('tutorial.title')}</h2>
            <p className="text-xs text-ink-faint mt-0.5">{t('tutorial.subtitle')}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink transition-colors mt-1">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-1">
          {steps.map((n) => (
            <div key={n} className="flex gap-5 items-center py-3 border-b border-line/60 last:border-0">
              <div className="w-[120px] h-[84px] shrink-0 bg-surface rounded-lg border border-line/60">
                {DIAGRAMS[n]}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">{t(`tutorial.step${n}.title` as Parameters<typeof t>[0])}</h3>
                <p className="text-xs text-ink-muted leading-relaxed mt-1">{t(`tutorial.step${n}.desc` as Parameters<typeof t>[0])}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-line/60 shrink-0">
          <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium mb-1.5">{t('tutorial.shortcuts')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted font-mono">
            <span>\u2318F {t('shortcut.search')}</span>
            <span>Space {t('shortcut.collapse')}</span>
            <span>R {t('shortcut.regenerate')}</span>
            <span>\u2191\u2193\u2190\u2192 {t('shortcut.navigate')}</span>
            <span>\u2318Z {t('shortcut.undo')}</span>
            <span>Esc {t('shortcut.escape')}</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line shrink-0 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="text-xs bg-accent hover:bg-accent-strong text-white px-5 py-2 rounded-lg transition-colors"
          >
            {t('tutorial.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
