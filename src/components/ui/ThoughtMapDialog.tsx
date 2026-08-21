import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Loader2, Sparkles, X } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore, toast } from '../../lib/ui-store';
import { useProjects } from '../../store/projects';
import { useI18n, useT } from '../../i18n';
import {
  extractStructure, computeStats, tidyPositions, handPositions,
  statParts, fallbackCaption, attributionLine, TMAP_SITE_URL,
  type MapStructure, type MapStats,
} from '../../lib/thought-map';
import { llmCall } from '../../lib/api';

// The export console for the thought map. The knobs ARE the feature: a
// picture the user tuned is a picture they own — and share. Zero-content
// principle: the artifact carries shape, counts, and the two lines the
// user typed here; canvas text never enters it (or the caption prompt).

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#FAF9F7"/><line x1="19" y1="10" x2="19" y2="18" stroke="#6B5CE7" stroke-width="2.5" stroke-linecap="round"/><line x1="19" y1="25" x2="19" y2="33" stroke="#6B5CE7" stroke-width="2.5" stroke-linecap="round"/><line x1="22.5" y1="23.5" x2="30" y2="28.5" stroke="#E08A3C" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"/><circle cx="19" cy="7" r="3.8" fill="#6B5CE7"/><circle cx="19" cy="21.5" r="3.8" fill="none" stroke="#6B5CE7" stroke-width="2.6"/><circle cx="19" cy="36.5" r="3.8" fill="#6B5CE7"/><circle cx="32.5" cy="30" r="3.4" fill="#E08A3C"/></svg>`;

function Artifact({ structure, positions, stats, title, subtitle, lang, paper, ts, artRef }: {
  structure: MapStructure;
  positions: Record<string, [number, number]>;
  stats: MapStats;
  title: string;
  subtitle: string;
  lang: 'zh' | 'en';
  paper: 'light' | 'dark';
  ts: number;
  artRef: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const bbox = useMemo(() => {
    const xs = Object.values(positions).map((p) => p[0]);
    const ys = Object.values(positions).map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
  }, [positions]);
  const tpl = bbox.h / bbox.w >= 1.35 ? 'scroll' : 'cover';
  const parts = statParts(stats, lang);

  useEffect(() => {
    const box = boxRef.current, art = artRef.current;
    if (!box || !art) return;
    box.innerHTML = '';
    const bw = box.clientWidth, bh = box.clientHeight;
    if (!bw || !bh) return;
    const NS = 'http://www.w3.org/2000/svg';
    const S = (tag: string, attrs: Record<string, string | number>) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
      return el;
    };
    const svg = S('svg', { width: '100%', height: '100%', viewBox: `0 0 ${bw} ${bh}` });
    box.appendChild(svg);
    // orient the graph to the box, fit with a tight margin
    const rot = (bbox.h / bbox.w >= 1) !== (bh / bw >= 1);
    const P: Record<string, [number, number]> = {};
    Object.entries(positions).forEach(([id, [x, y]]) => { P[id] = rot ? [y, -x] : [x, y]; });
    const pxs = Object.values(P).map((p) => p[0]), pys = Object.values(P).map((p) => p[1]);
    const mnx = Math.min(...pxs), mny = Math.min(...pys);
    const pad = 24;
    const sc = Math.min((bw - 2 * pad) / (Math.max(...pxs) - mnx + 1), (bh - 2 * pad) / (Math.max(...pys) - mny + 1));
    const ox = (bw - (Math.max(...pxs) - mnx) * sc) / 2, oy = (bh - (Math.max(...pys) - mny) * sc) / 2;
    const pt: Record<string, [number, number]> = {};
    Object.entries(P).forEach(([id, [x, y]]) => { pt[id] = [(x - mnx) * sc + ox, (y - mny) * sc + oy]; });
    const cs = getComputedStyle(art);
    const inkC = cs.getPropertyValue('--tm-ink').trim();
    const redC = cs.getPropertyValue('--tm-red').trim();
    const edgeC = cs.getPropertyValue('--tm-edge').trim();
    const N = structure.nodes.length;
    const rBase = Math.max(1.7, Math.min(5.2, 5.6 * Math.sqrt(60 / N)));
    const ew = Math.max(0.5, Math.min(1.1, rBase * 0.26));
    structure.edges.forEach((e) => {
      const a = pt[e.s], b = pt[e.t];
      if (!a || !b) return;
      svg.appendChild(S('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: edgeC, 'stroke-width': ew, ...(e.dashed ? { 'stroke-dasharray': '3 3' } : {}) }));
    });
    structure.nodes.forEach((n) => {
      const p = pt[n.id];
      if (!p) return;
      const r = n.root ? rBase + 2.6 : rBase;
      if (n.material) {
        const s2 = r + 0.8;
        svg.appendChild(S('rect', { x: p[0] - s2 / 1.45, y: p[1] - s2 / 1.45, width: s2 * 1.38, height: s2 * 1.38, fill: 'none', stroke: inkC, 'stroke-width': Math.max(0.8, ew + 0.2), transform: `rotate(45 ${p[0]} ${p[1]})` }));
      } else {
        svg.appendChild(S('circle', { cx: p[0], cy: p[1], r, fill: n.marked ? redC : inkC }));
      }
    });
  }, [structure, positions, bbox, paper, ts, tpl, artRef]);

  const brand = (
    <div className="tmap-brand">
      <span dangerouslySetInnerHTML={{ __html: LOGO_SVG }} style={{ display: 'contents' }} />
      <div className="tmap-bt"><b>ThoughtDAG</b><br />chenxiachan.github.io/thoughtdag</div>
    </div>
  );
  return (
    <div ref={artRef} className={`tmap-art tmap-${paper} tmap-${tpl}`} style={{ ['--tmts' as string]: ts }} data-tmap-art>
      {tpl === 'scroll' ? (
        <>
          <div className="tmap-head">
            <div className="tmap-k">{t('tmap.kicker')}</div>
            <h4 className="tmap-t">{title}</h4>
            {subtitle && <div className="tmap-s">{subtitle}</div>}
            <div className="tmap-rule" />
            <div className="tmap-stats">
              {parts.map(([n, l], i) => (<span key={i}><b>{n}</b> {l}<br /></span>))}
            </div>
            <div className="tmap-spacer" />
            {brand}
          </div>
          <div className="tmap-graph" ref={boxRef} />
        </>
      ) : (
        <>
          <div className="tmap-head">
            <div className="tmap-k">{t('tmap.kicker')}</div>
            <h4 className="tmap-t">{title}</h4>
            {subtitle && <div className="tmap-s">{subtitle}</div>}
          </div>
          <div className="tmap-graph" ref={boxRef} />
          <div className="tmap-footrow">
            <div className="tmap-statline">{parts.map(([n, l], i) => (<span key={i}>{i > 0 && ' · '}<b>{n}</b> {l}</span>))}</div>
            {brand}
          </div>
        </>
      )}
    </div>
  );
}

export default function ThoughtMapDialog() {
  const open = useUiStore((s) => s.thoughtMapOpen);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const projectName = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.name ?? '');

  const [layout, setLayout] = useState<'tidy' | 'hand'>('tidy');
  const [paper, setPaper] = useState<'light' | 'dark'>('light');
  const [ts, setTs] = useState(1.15);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [caption, setCaption] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const artRef = useRef<HTMLDivElement | null>(null);

  const structure = useMemo(() => extractStructure(nodes, edges), [nodes, edges]);
  const stats = useMemo(() => computeStats(nodes), [nodes]);
  const positions = useMemo(
    () => (layout === 'tidy' ? tidyPositions(structure) : handPositions(structure)),
    [structure, layout],
  );

  // opening seeds the hand-filled fields; the canvas name is a fair default
  // for the PUBLIC title only because the user sees and can rewrite it here
  useEffect(() => {
    if (!open) return;
    setTitle(projectName);
    setSubtitle('');
    setCaption(fallbackCaption(lang, projectName || 'ThoughtDAG', stats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); useUiStore.getState().setThoughtMapOpen(false); } };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  if (!open) return null;
  const close = () => useUiStore.getState().setThoughtMapOpen(false);
  const fullCaption = () => `${caption.trim()}\n\n${attributionLine()}`;

  const renderPng = async (): Promise<string> => {
    const { toPng } = await import('html-to-image');
    return toPng(artRef.current!, { pixelRatio: 1200 / 460 });
  };
  const downloadPng = async (): Promise<void> => {
    setBusy(true);
    try {
      const url = await renderPng();
      const a = document.createElement('a');
      a.download = `thought-map-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = url;
      a.click();
    } catch {
      toast('error', t('tmap.exportFailed'));
    } finally { setBusy(false); }
  };
  const saveAndCopy = async (): Promise<void> => {
    await downloadPng();
    await navigator.clipboard.writeText(fullCaption()).catch(() => {});
    toast('success', t('tmap.savedCopied'));
  };
  const draft = async (): Promise<void> => {
    setDrafting(true);
    try {
      const s = statParts(stats, lang).map(([n, l]) => `${n} ${l}`).join(', ');
      const text = await llmCall([{
        role: 'user',
        content: `Write a short social media caption in ${lang === 'zh' ? 'Chinese' : 'English'} (2-3 sentences) about a "thought map" image: a picture of how someone explored one question, node by node. You know ONLY these public facts, use nothing else: title "${title}", ${subtitle ? `subtitle "${subtitle}", ` : ''}structure: ${s}. First person, calm and concrete, no hype, no hashtags, no emoji, and never use dash characters (—, –, -); use commas or periods instead. Do not mention any tool name. Output only the caption text.`,
      }]);
      if (text.trim()) setCaption(text.trim());
    } catch {
      toast('error', t('tmap.draftFailed'));
    } finally { setDrafting(false); }
  };

  const seg = (val: string, cur: string, set: () => void, label: string, key: string) => (
    <button key={key} onClick={set}
      className={`flex-1 px-2 py-1.5 text-2xs transition-colors border-l border-line first:border-l-0 ${cur === val ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-wash'}`}>
      {label}
    </button>
  );

  return createPortal((
    <div className="fixed inset-0 z-[85] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-thought-map>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(880px,95vw)] max-h-[94vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-sm font-semibold text-ink">{t('tmap.title')}</div>
            <div className="text-2xs text-ink-faint mt-0.5">{t('tmap.zeroContent')}</div>
          </div>
          <button onClick={close} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex gap-5 mt-3 flex-wrap">
          {/* controls */}
          <div className="w-[300px] flex flex-col gap-3 shrink-0">
            <div>
              <div className="text-2xs text-ink-faint mb-1">{t('tmap.publicTitle')} <span className="float-right font-mono">{title.length}/24</span></div>
              <input value={title} maxLength={24} onChange={(e) => setTitle(e.target.value)} data-tmap-title
                className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink focus:outline-none focus:ring-1 focus:ring-accent/40" />
            </div>
            <div>
              <div className="text-2xs text-ink-faint mb-1">{t('tmap.subtitle')}</div>
              <input value={subtitle} maxLength={40} onChange={(e) => setSubtitle(e.target.value)} placeholder={t('tmap.subtitlePh')}
                className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.layout')}</div>
                <div className="flex rounded-lg border border-line overflow-hidden">
                  {seg('tidy', layout, () => setLayout('tidy'), t('tmap.tidy'), 'tidy')}
                  {seg('hand', layout, () => setLayout('hand'), t('tmap.hand'), 'hand')}
                </div>
              </div>
              <div className="flex-1">
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.paper')}</div>
                <div className="flex rounded-lg border border-line overflow-hidden">
                  {seg('light', paper, () => setPaper('light'), t('tmap.paperLight'), 'l')}
                  {seg('dark', paper, () => setPaper('dark'), t('tmap.paperDark'), 'd')}
                </div>
              </div>
            </div>
            <div>
              <div className="text-2xs text-ink-faint mb-1">{t('tmap.size')} <span className="float-right font-mono">{ts.toFixed(2)}×</span></div>
              <input type="range" min={0.85} max={1.45} step={0.05} value={ts} onChange={(e) => setTs(parseFloat(e.target.value))}
                className="w-full accent-[color:var(--color-accent)]" />
            </div>
            <div>
              <div className="text-2xs text-ink-faint mb-1 flex items-center justify-between">
                <span>{t('tmap.caption')}</span>
                <button onClick={() => void draft()} disabled={drafting}
                  className="flex items-center gap-1 text-2xs text-accent hover:bg-accent/10 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-50">
                  {drafting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} strokeWidth={1.75} />}
                  {drafting ? t('tmap.drafting') : t('tmap.draft')}
                </button>
              </div>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4}
                className="w-full border border-line rounded-lg px-3 py-2 text-xs bg-card text-ink leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent/40" />
              <div className="text-2xs text-ink-faint font-mono mt-1 leading-snug">{attributionLine()}</div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => void downloadPng()} disabled={busy} data-tmap-download
                className="flex items-center gap-1.5 text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={1.75} />}
                {t('tmap.download')}
              </button>
              <button onClick={() => { void navigator.clipboard.writeText(fullCaption()); toast('success', t('tmap.captionCopied')); }}
                className="flex items-center gap-1.5 text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">
                <Copy size={13} strokeWidth={1.75} /> {t('tmap.copyCaption')}
              </button>
              <button onClick={() => { void navigator.clipboard.writeText(fullCaption()); window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(fullCaption())}`, '_blank'); }}
                className="text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">X</button>
              <button onClick={() => { void navigator.clipboard.writeText(fullCaption()); window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(TMAP_SITE_URL)}`, '_blank'); toast('success', t('tmap.captionCopied')); }}
                className="text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">LinkedIn</button>
              <button onClick={() => void saveAndCopy()}
                className="text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">{lang === 'zh' ? '小红书' : 'Instagram'}</button>
            </div>
          </div>
          {/* preview at 0.78 scale; the full-size node is what rasterizes */}
          <div className="shrink-0" style={{ width: 460 * 0.78, height: 575 * 0.78 }}>
            <div style={{ transform: 'scale(0.78)', transformOrigin: 'top left' }} className="rounded-md shadow-xl">
              <Artifact structure={structure} positions={positions} stats={stats}
                title={title || 'ThoughtDAG'} subtitle={subtitle} lang={lang} paper={paper} ts={ts} artRef={artRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
