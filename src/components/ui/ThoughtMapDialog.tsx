import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Copy, Download, Loader2, Sparkles, X } from 'lucide-react';
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

// The thought-map console, two rooms with one door between them. Room one
// edits the PICTURE: knobs left, live artifact centre, a feed-size
// thumbnail as the honesty check — and a single exit, Download. Room two
// edits the WORDS: the caption (attribution included, one editable body)
// and the platform doors. Zero-content principle: the artifact and the
// caption carry shape, counts, and hand-approved lines only. The AI draft
// reads the canvas LOCALLY (root question + map plaques) exactly like
// every other model feature; nothing ships until the user exports it.

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="10" fill="#FAF9F7"/><line x1="19" y1="10" x2="19" y2="18" stroke="#6B5CE7" stroke-width="2.5" stroke-linecap="round"/><line x1="19" y1="25" x2="19" y2="33" stroke="#6B5CE7" stroke-width="2.5" stroke-linecap="round"/><line x1="22.5" y1="23.5" x2="30" y2="28.5" stroke="#E08A3C" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"/><circle cx="19" cy="7" r="3.8" fill="#6B5CE7"/><circle cx="19" cy="21.5" r="3.8" fill="none" stroke="#6B5CE7" stroke-width="2.6"/><circle cx="19" cy="36.5" r="3.8" fill="#6B5CE7"/><circle cx="32.5" cy="30" r="3.4" fill="#E08A3C"/></svg>`;

const KICKER = { zh: '一张思路地图', en: 'A THOUGHT MAP' };

function Artifact({ structure, positions, stats, title, subtitle, mapLang, paper, ts, showStats, timeInk, dateText, artRef }: {
  structure: MapStructure;
  positions: Record<string, [number, number]>;
  stats: MapStats;
  title: string;
  subtitle: string;
  mapLang: 'zh' | 'en';
  paper: 'light' | 'dark';
  ts: number;
  showStats: boolean;
  timeInk: boolean;
  /** the archival stamp — '' hides it */
  dateText: string;
  artRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const selfRef = useRef<HTMLDivElement>(null);
  const bbox = useMemo(() => {
    const xs = Object.values(positions).map((p) => p[0]);
    const ys = Object.values(positions).map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
  }, [positions]);
  const tpl = bbox.h / bbox.w >= 1.35 ? 'scroll' : 'cover';
  const parts = statParts(stats, mapLang);

  useEffect(() => {
    const box = boxRef.current;
    const art = artRef?.current ?? selfRef.current;
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
    const rot = (bbox.h / bbox.w >= 1) !== (bh / bw >= 1);
    const P: Record<string, [number, number]> = {};
    Object.entries(positions).forEach(([id, [x, y]]) => { P[id] = rot ? [y, -x] : [x, y]; });
    const pxs = Object.values(P).map((p) => p[0]), pys = Object.values(P).map((p) => p[1]);
    const mnx = Math.min(...pxs), mny = Math.min(...pys);
    // the graph owns the whole sheet; the pads keep its mass out of the
    // text zones, while the text layer stays free to run over the picture
    const pads = tpl === 'scroll'
      ? { l: 212, r: 28, t: 28, b: 28 }
      : { l: 28, r: 28, t: 28 + (title ? 124 : 0) + (subtitle ? 36 : 0), b: showStats ? 90 : 64 };
    const gw2 = Math.max(...pxs) - mnx + 1, gh2 = Math.max(...pys) - mny + 1;
    const sc = Math.min((bw - pads.l - pads.r) / gw2, (bh - pads.t - pads.b) / gh2);
    const ox = pads.l + ((bw - pads.l - pads.r) - gw2 * sc) / 2;
    const oy = pads.t + ((bh - pads.t - pads.b) - gh2 * sc) / 2;
    const pt: Record<string, [number, number]> = {};
    Object.entries(P).forEach(([id, [x, y]]) => { pt[id] = [(x - mnx) * sc + ox, (y - mny) * sc + oy]; });
    const cs = getComputedStyle(art);
    const inkC = cs.getPropertyValue('--tm-ink').trim();
    const inkMinC = cs.getPropertyValue('--tm-ink-min').trim();
    const redC = cs.getPropertyValue('--tm-red').trim();
    const edgeC = cs.getPropertyValue('--tm-edge').trim();
    const hexToRgb = (h: string): [number, number, number] => {
      const c = h.replace('#', '');
      return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
    };
    const lerpHex = (a: string, b: string, f: number): string => {
      const A = hexToRgb(a), B = hexToRgb(b);
      return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join('');
    };
    // time rank per qa node: 0 = earliest (pale), 1 = latest (full ink)
    const stamped = structure.nodes.filter((n) => !n.material && n.ts != null).sort((a, b) => a.ts! - b.ts!);
    const rank: Record<string, number> = {};
    stamped.forEach((n, i) => { rank[n.id] = stamped.length > 1 ? i / (stamped.length - 1) : 1; });
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
        const base = timeInk ? lerpHex(inkMinC, inkC, rank[n.id] ?? 1) : inkC;
        svg.appendChild(S('circle', { cx: p[0], cy: p[1], r, fill: n.marked ? redC : base }));
      }
    });
  }, [structure, positions, bbox, paper, ts, tpl, title, subtitle, showStats, timeInk, artRef]);

  const brand = (
    <div className="tmap-brand">
      <span dangerouslySetInnerHTML={{ __html: LOGO_SVG }} style={{ display: 'contents' }} />
      <div className="tmap-bt"><b>ThoughtDAG</b><br />chenxiachan.github.io/thoughtdag</div>
    </div>
  );
  return (
    <div ref={artRef ?? selfRef} className={`tmap-art tmap-${paper} tmap-${tpl}`} style={{ ['--tmts' as string]: ts }} data-tmap-art>
      {tpl === 'scroll' ? (
        <>
          <div className="tmap-head">
            <div className="tmap-k">{KICKER[mapLang]}</div>
            {dateText && <div className="tmap-date">{dateText}</div>}
            {title && <h4 className="tmap-t">{title}</h4>}
            {subtitle && <div className="tmap-s">{subtitle}</div>}
            {showStats && <>
              <div className="tmap-rule" />
              <div className="tmap-stats">
                {parts.map(([n, l], i) => (<span key={i}><b>{n}</b> {l}<br /></span>))}
              </div>
            </>}
            <div className="tmap-spacer" />
            {brand}
          </div>
          <div className="tmap-graph" ref={boxRef} />
        </>
      ) : (
        <>
          <div className="tmap-head">
            <div className="tmap-k">{KICKER[mapLang]}</div>
            {dateText && <div className="tmap-date">{dateText}</div>}
            {title && <h4 className="tmap-t">{title}</h4>}
            {subtitle && <div className="tmap-s">{subtitle}</div>}
          </div>
          <div className="tmap-graph" ref={boxRef} />
          <div className="tmap-footrow">
            {showStats
              ? <div className="tmap-statline">{parts.map(([n, l], i) => (<span key={i}>{i > 0 && ' · '}<b>{n}</b> {l}</span>))}</div>
              : <div />}
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
  const uiLang = useI18n((s) => s.lang);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const projectName = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.name ?? '');

  const [step, setStep] = useState<'image' | 'share'>('image');
  const [layout, setLayout] = useState<'tidy' | 'hand'>('tidy');
  const [paper, setPaper] = useState<'light' | 'dark'>('light');
  const [mapLang, setMapLang] = useState<'zh' | 'en'>('zh');
  const [capLang, setCapLang] = useState<'zh' | 'en'>('zh');
  const [ts, setTs] = useState(1.15);
  const [showStats, setShowStats] = useState(true);
  const [timeInk, setTimeInk] = useState(false);
  const [showDate, setShowDate] = useState(true);
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
  // the archival stamp: the exploration's real span, mined from node ids
  const dateText = useMemo(() => {
    if (!showDate) return '';
    const stamps = structure.nodes.map((n) => n.ts).filter((x): x is number => x != null);
    if (!stamps.length) return '';
    const a = new Date(Math.min(...stamps)), b = new Date(Math.max(...stamps));
    if (mapLang === 'zh') {
      const f = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      return f(a) === f(b) ? f(a) : `${f(a)} 至 ${f(b)}`;
    }
    const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const fy = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (a.toDateString() === b.toDateString()) return fy(a);
    return a.getFullYear() === b.getFullYear() ? `${f(a)} to ${fy(b)}` : `${fy(a)} to ${fy(b)}`;
  }, [structure, mapLang, showDate]);

  useEffect(() => {
    if (!open) return;
    setStep('image');
    setMapLang(uiLang);
    setCapLang(uiLang);
    setTitle(projectName);
    setSubtitle('');
    setCaption(`${fallbackCaption(uiLang, projectName || 'ThoughtDAG', stats)}\n\n${attributionLine()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // the caption language rewrites the fallback text (untouched drafts only)
  const capTouched = useRef(false);
  useEffect(() => {
    if (!open || capTouched.current) return;
    setCaption(`${fallbackCaption(capLang, title || 'ThoughtDAG', stats)}\n\n${attributionLine()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capLang, mapLang]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); useUiStore.getState().setThoughtMapOpen(false); } };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  if (!open) return null;
  const close = () => { capTouched.current = false; useUiStore.getState().setThoughtMapOpen(false); };

  const downloadPng = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const { toPng } = await import('html-to-image');
      const url = await toPng(artRef.current!, { pixelRatio: 1200 / 460 });
      const a = document.createElement('a');
      a.download = `thought-map-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = url;
      a.click();
      return true;
    } catch {
      toast('error', t('tmap.exportFailed'));
      return false;
    } finally { setBusy(false); }
  };

  // one draft, three fields: title, subtitle, caption — sourced from the
  // root question and the map plaques (the already-distilled layer)
  const draft = async (): Promise<void> => {
    setDrafting(true);
    try {
      const root = nodes.find((n) => n.data.isRoot)?.data.question?.slice(0, 200) ?? '';
      const plaques = nodes
        .map((n) => { const ss = n.data.summaries; return Array.isArray(ss) ? (ss[n.data.responseIndex] ?? ss[0]) : undefined; })
        .filter((x): x is string => !!x)
        .slice(0, 24);
      const s = statParts(stats, mapLang).map(([n, l]) => `${n} ${l}`).join(', ');
      const capStats = statParts(stats, capLang).map(([n, l]) => `${n} ${l}`).join(', ');
      const langName = mapLang === 'zh' ? 'Chinese' : 'English';
      const capLangName = capLang === 'zh' ? 'Chinese' : 'English';
      const raw = await llmCall([{
        role: 'user',
        content: `You are naming a share image called a "thought map": a picture of how someone explored one question, node by node. Sources:\nRoot question: ${root}\nStep takeaways: ${plaques.join(' / ')}\nStructure: ${s}\n\nOutput STRICT JSON only, no code fence:\n{"title":"...","subtitle":"...","caption":"..."}\ntitle: in ${langName}, what this exploration was about, at most 24 characters, evocative but concrete, no tool names.\nsubtitle: in ${langName}, one short line of context, at most 40 characters.\ncaption: in ${capLangName}, 2 or 3 first-person sentences for a social post that WEAVE IN these numbers: ${capStats}. Calm and concrete, no hype, no hashtags, no emoji, no tool names.\nNever use dash characters anywhere; use commas or periods.`,
      }]);
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const j = JSON.parse(m[0]) as { title?: string; subtitle?: string; caption?: string };
        if (j.title) setTitle(j.title.slice(0, 24));
        if (j.subtitle) setSubtitle(j.subtitle.slice(0, 40));
        if (j.caption) { capTouched.current = true; setCaption(`${j.caption.trim()}\n\n${attributionLine()}`); }
      } else {
        toast('error', t('tmap.draftFailed'));
      }
    } catch {
      toast('error', t('tmap.draftFailed'));
    } finally { setDrafting(false); }
  };

  // every button copies the caption first; 'save' platforms have no web
  // posting door, so they save the image too and the user pastes in-app
  const share = (kind: string, name: string) => {
    void navigator.clipboard.writeText(caption).catch(() => {});
    const cap = encodeURIComponent(caption);
    const site = encodeURIComponent(TMAP_SITE_URL);
    const ttl = encodeURIComponent(title || 'ThoughtDAG');
    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${cap}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${site}`,
      bluesky: `https://bsky.app/intent/compose?text=${cap}`,
      threads: `https://www.threads.net/intent/post?text=${cap}`,
      weibo: `https://service.weibo.com/share/share.php?url=${site}&title=${cap}`,
      reddit: `https://www.reddit.com/submit?url=${site}&title=${ttl}`,
      telegram: `https://t.me/share/url?url=${site}&text=${cap}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${site}`,
    };
    if (kind === 'save') { void downloadPng(); toast('success', t('tmap.savedCopied')); return; }
    window.open(urls[kind], '_blank', 'noopener');
    if (kind !== 'x' && kind !== 'bluesky' && kind !== 'threads') toast('success', t('tmap.captionCopied'));
    void name;
  };

  const PLATFORMS: [string, string][] = [
    ['X', 'x'], ['LinkedIn', 'linkedin'], ['Bluesky', 'bluesky'], ['Threads', 'threads'],
    [t('tmap.weibo'), 'weibo'], ['Reddit', 'reddit'], ['Telegram', 'telegram'], ['Facebook', 'facebook'],
    [t('tmap.xhs'), 'save'], ['Instagram', 'save'],
  ];

  const seg = (
    entries: [string, string][],
    cur: string,
    set: (v: string) => void,
  ) => (
    <div className="flex rounded-lg border border-line overflow-hidden">
      {entries.map(([v, label], i) => (
        <button key={v} onClick={() => set(v)}
          className={`flex-1 px-2 py-1.5 text-2xs whitespace-nowrap transition-colors ${i > 0 ? 'border-l border-line' : ''} ${cur === v ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-wash'}`}>
          {label}
        </button>
      ))}
    </div>
  );

  return createPortal((
    <div className="fixed inset-0 z-[85] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" onClick={close} data-thought-map>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(1040px,96vw)] max-h-[95vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="text-sm font-semibold text-ink">{t('tmap.title')}{step === 'share' ? ` · ${t('tmap.shareStep')}` : ''}</div>
          <button onClick={close} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {step === 'image' ? (
          <div className="flex gap-6 flex-wrap">
            {/* knobs */}
            <div className="w-[250px] flex flex-col gap-3.5 shrink-0">
              <div>
                <div className="text-2xs text-ink-faint mb-1 flex items-center justify-between">
                  <span>{t('tmap.publicTitle')}</span>
                  <button onClick={() => void draft()} disabled={drafting} data-tmap-draft
                    className="flex items-center gap-1 text-2xs text-accent hover:bg-accent/10 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-50">
                    {drafting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} strokeWidth={1.75} />}
                    {drafting ? t('tmap.drafting') : t('tmap.draft')}
                  </button>
                </div>
                <input value={title} maxLength={24} onChange={(e) => setTitle(e.target.value)} data-tmap-title placeholder={t('tmap.subtitlePh')}
                  className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40" />
                <div className="text-2xs text-ink-faint font-mono text-right mt-0.5">{title.length}/24</div>
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.subtitle')}</div>
                <input value={subtitle} maxLength={40} onChange={(e) => setSubtitle(e.target.value)} placeholder={t('tmap.subtitlePh')} data-tmap-subtitle
                  className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40" />
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.layout')}</div>
                {seg([['tidy', t('tmap.tidy')], ['hand', t('tmap.hand')]], layout, (v) => setLayout(v as 'tidy' | 'hand'))}
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.paper')}</div>
                {seg([['light', t('tmap.paperLight')], ['dark', t('tmap.paperDark')]], paper, (v) => setPaper(v as 'light' | 'dark'))}
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.mapLang')}</div>
                {seg([['zh', '中文'], ['en', 'EN']], mapLang, (v) => setMapLang(v as 'zh' | 'en'))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="text-2xs text-ink-faint mb-1">{t('tmap.statsLbl')}</div>
                  {seg([['on', t('tmap.show')], ['off', t('tmap.hide')]], showStats ? 'on' : 'off', (v) => setShowStats(v === 'on'))}
                </div>
                <div className="flex-1">
                  <div className="text-2xs text-ink-faint mb-1">{t('tmap.dateLbl')}</div>
                  {seg([['on', t('tmap.show')], ['off', t('tmap.hide')]], showDate ? 'on' : 'off', (v) => setShowDate(v === 'on'))}
                </div>
                <div className="flex-1">
                  <div className="text-2xs text-ink-faint mb-1">{t('tmap.timeInk')}</div>
                  {seg([['off', t('tmap.hide')], ['on', t('tmap.show')]], timeInk ? 'on' : 'off', (v) => setTimeInk(v === 'on'))}
                </div>
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.size')} <span className="float-right font-mono">{ts.toFixed(2)}×</span></div>
                <input type="range" min={0.85} max={1.45} step={0.05} value={ts} onChange={(e) => setTs(parseFloat(e.target.value))}
                  className="w-full accent-[color:var(--color-accent)]" />
              </div>
              <div className="flex-1" />
              <button onClick={() => { void downloadPng().then((ok) => { if (ok) setStep('share'); }); }} disabled={busy} data-tmap-download
                className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-accent text-white hover:bg-accent-strong rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={1.75} />}
                {t('tmap.download')}
              </button>
            </div>
            {/* the artifact, full size */}
            <div className="shrink-0 rounded-md shadow-xl overflow-hidden" style={{ width: 460, height: 575 }}>
              <Artifact structure={structure} positions={positions} stats={stats}
                title={title} subtitle={subtitle} mapLang={mapLang} paper={paper} ts={ts}
                showStats={showStats} timeInk={timeInk} dateText={dateText} artRef={artRef} />
            </div>
            {/* the honesty check: the feed-size thumbnail */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div className="rounded-sm shadow-lg overflow-hidden" style={{ width: 132, height: 165 }}>
                <div style={{ transform: 'scale(0.28695)', transformOrigin: 'top left', width: 460, height: 575 }}>
                  <Artifact structure={structure} positions={positions} stats={stats}
                    title={title} subtitle={subtitle} mapLang={mapLang} paper={paper} ts={ts}
                    showStats={showStats} timeInk={timeInk} dateText={dateText} />
                </div>
              </div>
              <div className="text-2xs text-ink-faint">{t('tmap.thumbCap')}</div>
            </div>
          </div>
        ) : (
          <div className="flex gap-6 flex-wrap" data-tmap-share-step>
            <div className="shrink-0 rounded-sm shadow-lg overflow-hidden" style={{ width: 184, height: 230 }}>
              <div style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: 460, height: 575 }}>
                <Artifact structure={structure} positions={positions} stats={stats}
                  title={title} subtitle={subtitle} mapLang={mapLang} paper={paper} ts={ts}
                  showStats={showStats} timeInk={timeInk} dateText={dateText} artRef={artRef} />
              </div>
            </div>
            <div className="flex-1 min-w-[320px] flex flex-col gap-3">
              <div>
                <div className="text-2xs text-ink-faint mb-1 flex items-center justify-between">
                  <span>{t('tmap.caption')}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex rounded-md border border-line overflow-hidden" data-tmap-caplang>
                      {(['zh', 'en'] as const).map((v, i) => (
                        <button key={v} onClick={() => { capTouched.current = false; setCapLang(v); }}
                          className={`px-2 py-0.5 text-2xs transition-colors ${i > 0 ? 'border-l border-line' : ''} ${capLang === v ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted hover:bg-wash'}`}>
                          {v === 'zh' ? '中文' : 'EN'}
                        </button>
                      ))}
                    </span>
                    <button onClick={() => void draft()} disabled={drafting}
                      className="flex items-center gap-1 text-2xs text-accent hover:bg-accent/10 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-50">
                      {drafting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} strokeWidth={1.75} />}
                      {drafting ? t('tmap.drafting') : t('tmap.draft')}
                    </button>
                  </span>
                </div>
                <textarea value={caption} onChange={(e) => { capTouched.current = true; setCaption(e.target.value); }} rows={7} data-tmap-caption
                  className="w-full border border-line rounded-lg px-3 py-2 text-xs bg-card text-ink leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent/40" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => { void navigator.clipboard.writeText(caption); toast('success', t('tmap.captionCopied')); }}
                  className="flex items-center gap-1.5 text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 rounded-lg px-3 py-2 transition-colors">
                  <Copy size={13} strokeWidth={1.75} /> {t('tmap.copyCaption')}
                </button>
                {PLATFORMS.map(([name, kind]) => (
                  <button key={name} onClick={() => share(kind, name)}
                    className="text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">
                    {name}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={() => setStep('image')} data-tmap-back
                className="self-start flex items-center gap-1.5 text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">
                <ArrowLeft size={13} strokeWidth={1.75} /> {t('tmap.backToImage')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
