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
  7: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      {/* a note (amber) wired solid + a reference arriving dashed from the side */}
      <rect x={14} y={12} width={30} height={22} rx={3} fill="#FEF3C7" stroke="#F59E0B" strokeWidth={0.8} />
      <line x1={29} y1={34} x2={29} y2={50} stroke={COLORS.accent} strokeWidth={1.75} />
      <path d="M 26 47 L 29 52 L 32 47 Z" fill={COLORS.accent} />
      <Card x={12} y={52} tone="accent" />
      <path d="M 100 22 C 80 22, 70 55, 50 60" stroke={COLORS.accent} strokeWidth={1.75} fill="none" strokeDasharray="5 3" />
      <path d="M 52 57 L 47 61 L 52 64 Z" fill={COLORS.accent} />
      <Card x={82} y={12} />
    </svg>
  ),
  9: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      <Card x={43} y={10} tone="accent" />
      <line x1={60} y1={30} x2={60} y2={48} stroke={COLORS.accent} strokeWidth={1.75} />
      <path d="M 57 45 L 60 50 L 63 45 Z" fill={COLORS.accent} />
      <Card x={43} y={50} />
      <circle cx={75} cy={53} r={4} fill="#F59E0B" />
      <path d="M 73.5 53 a 1.5 1.5 0 1 1 3 0" stroke="white" strokeWidth={0.9} fill="none" />
      <text x={60} y={80} textAnchor="middle" fontSize={7} fill={COLORS.inkMuted} fontFamily="JetBrains Mono Variable, monospace">v2/2 · replay</text>
    </svg>
  ),
  6: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      {/* palette strip + a note and an image card */}
      <rect x={8} y={18} width={14} height={48} rx={4} fill="white" stroke={COLORS.line} strokeWidth={1} />
      <circle cx={15} cy={27} r={3} fill={COLORS.accent} opacity={0.7} />
      <rect x={12} y={37} width={6} height={6} rx={1} fill="#F59E0B" opacity={0.8} />
      <rect x={12} y={49} width={6} height={6} rx={1} fill={COLORS.inkMuted} opacity={0.5} />
      <rect x={38} y={14} width={32} height={24} rx={3} fill="#FEF3C7" stroke="#F59E0B" strokeWidth={0.8} />
      <rect x={80} y={14} width={32} height={24} rx={3} fill="white" stroke={COLORS.line} strokeWidth={1} />
      <circle cx={88} cy={22} r={3} fill={COLORS.line} />
      <path d="M 82 34 L 92 26 L 100 32 L 108 24" stroke={COLORS.inkMuted} strokeWidth={1.2} fill="none" />
      <text x={72} y={62} textAnchor="middle" fontSize={7} fill={COLORS.inkMuted} fontFamily="JetBrains Mono Variable, monospace">⌘V paste anything</text>
    </svg>
  ),
  8: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      {/* selection box around three cards, fan-in to one */}
      <rect x={8} y={8} width={70} height={52} rx={3} fill={COLORS.accent} opacity={0.06} stroke={COLORS.accent} strokeWidth={0.8} strokeDasharray="3 2" />
      <Card x={14} y={14} w={26} h={16} />
      <Card x={46} y={14} w={26} h={16} />
      <Card x={30} y={38} w={26} h={16} />
      <path d="M 40 46 C 60 50, 70 50, 84 48" stroke={COLORS.accent} strokeWidth={1.4} fill="none" />
      <path d="M 59 30 C 70 36, 76 42, 84 46" stroke={COLORS.accent} strokeWidth={1.4} fill="none" />
      <path d="M 43 22 C 66 24, 76 38, 84 44" stroke={COLORS.accent} strokeWidth={1.4} fill="none" />
      <Card x={84} y={40} w={28} h={18} tone="accent" />
    </svg>
  ),
  10: (
    <svg viewBox="0 0 120 84" className="w-full h-full">
      {/* paradigm: human step (warm) → two prompt steps auto-running */}
      <Card x={12} y={12} w={34} h={20} tone="warm" />
      <circle cx={20} cy={22} r={3} fill={COLORS.warm} opacity={0.8} />
      <line x1={29} y1={32} x2={29} y2={48} stroke={COLORS.accent} strokeWidth={1.75} />
      <path d="M 26 45 L 29 50 L 32 45 Z" fill={COLORS.accent} />
      <Card x={12} y={50} w={34} h={20} tone="accent" />
      <path d="M 46 60 C 60 60, 62 30, 74 26" stroke={COLORS.accent} strokeWidth={1.75} fill="none" />
      <path d="M 71 23.5 L 76 26 L 72 29.5 Z" fill={COLORS.accent} />
      <Card x={76} y={16} w={34} h={20} tone="accent" />
      <path d="M 88 58 L 96 62 L 88 66 Z" fill={COLORS.accent} />
      <text x={100} y={65} fontSize={7} fill={COLORS.inkMuted} fontFamily="JetBrains Mono Variable, monospace">▶</text>
    </svg>
  ),
};

export default function Tutorial() {
  const open = useUiStore((s) => s.tutorialOpen);
  const setOpen = useUiStore((s) => s.setTutorialOpen);
  const t = useT();

  if (!open) return null;

  // Hero layout: everything on one large floating page — two labeled rows
  // of five compact chapter cards, no scrolling on a normal desktop.
  const GROUPS: { label: string; steps: number[] }[] = [
    { label: t('tutorial.groupBasics'), steps: [1, 2, 3, 4, 5] },
    { label: t('tutorial.groupAdvanced'), steps: [6, 7, 8, 9, 10] },
  ];

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/25 flex items-center justify-center animate-fade-in p-6"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-card border border-line rounded-2xl shadow-2xl w-[min(1440px,95vw)] max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-7 pt-5 pb-3 shrink-0">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold text-ink tracking-tight">{t('tutorial.title')}</h2>
            <p className="text-xs text-ink-faint">{t('tutorial.subtitle')}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink transition-colors mt-1">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="overflow-y-auto px-7 pb-2">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-4 last:mb-1">
              <p className="text-2xs font-semibold text-ink-faint mb-2">{g.label}</p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {g.steps.map((n) => (
                  <div key={n} className="bg-surface border border-line/70 rounded-xl p-3 flex flex-col">
                    <div className="w-full aspect-[120/70] bg-card rounded-lg border border-line/60 mb-2 overflow-hidden">
                      {DIAGRAMS[n]}
                    </div>
                    <h3 className="text-xs font-semibold text-ink leading-snug">{t(`tutorial.step${n}.title` as Parameters<typeof t>[0])}</h3>
                    <p className="text-2xs text-ink-muted leading-relaxed mt-1">{t(`tutorial.step${n}.desc` as Parameters<typeof t>[0])}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-line/60 shrink-0">
          <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium mb-1.5">{t('tutorial.shortcuts')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-muted font-mono">
            <span>{'\u2318'}F {t('shortcut.search')}</span>
            <span>Space {t('shortcut.collapse')}</span>
            <span>R {t('shortcut.regenerate')}</span>
            <span>{'\u2191\u2193\u2190\u2192'} {t('shortcut.navigate')}</span>
            <span>{'\u2318'}Z {t('shortcut.undo')}</span>
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
