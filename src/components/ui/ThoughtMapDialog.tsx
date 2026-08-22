import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Copy, Download, Loader2, Sparkles, X } from 'lucide-react';
import { useStore } from '../../store';
import { useUiStore, toast } from '../../lib/ui-store';
import { useProjects } from '../../store/projects';
import { useI18n, useT } from '../../i18n';
import {
  extractStructure, computeStats, tidyPositions, handPositions,
  statParts, fallbackCaption, attributionLine, textWeight, clampWeight, TMAP_SITE_URL,
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

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="14.5 2.5 22 39"><line x1="19" y1="10" x2="19" y2="18" stroke="#6B5CE7" stroke-width="2.5" stroke-linecap="round"/><line x1="19" y1="25" x2="19" y2="33" stroke="#6B5CE7" stroke-width="2.5" stroke-linecap="round"/><line x1="22.5" y1="23.5" x2="30" y2="28.5" stroke="#E08A3C" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 3"/><circle cx="19" cy="7" r="3.8" fill="#6B5CE7"/><circle cx="19" cy="21.5" r="3.8" fill="none" stroke="#6B5CE7" stroke-width="2.6"/><circle cx="19" cy="36.5" r="3.8" fill="#6B5CE7"/><circle cx="32.5" cy="30" r="3.4" fill="#E08A3C"/></svg>`;

const KICKER = { zh: '一张思路地图', en: 'A THOUGHT MAP' };

// the mark ahead of each count, drawn as the sheet draws it
function StatGlyph({ kind }: { kind: 'dot' | 'dia' | 'red' }) {
  return (
    <svg className="tmap-sg" viewBox="0 0 10 10" aria-hidden>
      {kind === 'dia'
        ? <rect x="2.4" y="2.4" width="5.2" height="5.2" transform="rotate(45 5 5)" className="tmap-sg-dia" />
        : <circle cx="5" cy="5" r="3.6" className={kind === 'red' ? 'tmap-sg-red' : 'tmap-sg-ink'} />}
    </svg>
  );
}

// what the sheet can seat at default type size, both templates: the cover
// title holds two lines, the scroll title five narrow ones — 40 weight
// units (20 CJK / 40 latin); the subtitle rides three scroll lines: 56
const TITLE_MAX = 40;
const SUB_MAX = 56;

function Artifact({ structure, positions, stats, title, subtitle, mapLang, paper, rot, tst, tss, tsx, showStats, timeInk, dateText, sig, sigPos, artRef }: {
  structure: MapStructure;
  positions: Record<string, [number, number]>;
  stats: MapStats;
  title: string;
  subtitle: string;
  mapLang: 'zh' | 'en';
  paper: 'light' | 'dark';
  /** turn the graph 90° — the arrangement (side/top text) follows the resulting orientation */
  rot: boolean;
  tst: number;
  tss: number;
  tsx: number;
  showStats: boolean;
  timeInk: boolean;
  /** the archival stamp — '' hides it */
  dateText: string;
  sig: string;
  sigPos: 'byline' | 'corner';
  artRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const selfRef = useRef<HTMLDivElement>(null);
  const bbox = useMemo(() => {
    const xs = Object.values(positions).map((p) => p[0]);
    const ys = Object.values(positions).map((p) => p[1]);
    return { w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1 };
  }, [positions]);
  const tpl = (rot ? bbox.w / bbox.h : bbox.h / bbox.w) >= 1.35 ? 'scroll' : 'cover';
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
    const P: Record<string, [number, number]> = {};
    Object.entries(positions).forEach(([id, [x, y]]) => { P[id] = rot ? [y, -x] : [x, y]; });
    const pxs = Object.values(P).map((p) => p[0]), pys = Object.values(P).map((p) => p[1]);
    const mnx = Math.min(...pxs), mny = Math.min(...pys);
    // the graph owns the whole sheet; the pads keep its mass out of the
    // text zones, while the text layer stays free to run over the picture
    const pads = tpl === 'scroll'
      ? { l: 212, r: 28, t: 28, b: 28 }
      : { l: 28, r: 28, t: 28 + (title ? 124 : 0) + (subtitle ? 36 : 0) + (sig && sigPos === 'byline' ? 26 : 0), b: showStats ? 72 : 48 };
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
    // the terminus: departure is the big dot, arrival is the double circle —
    // the last inked step, or the last step laid down when clocks are absent
    const termId = stamped.length
      ? stamped[stamped.length - 1].id
      : [...structure.nodes].reverse().find((n) => !n.material)?.id ?? null;
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
        if (n.id === termId) svg.appendChild(S('circle', { cx: p[0], cy: p[1], r: r + 2.8, fill: 'none', stroke: inkC, 'stroke-width': Math.max(0.9, ew + 0.15) }));
      }
    });
  }, [structure, positions, bbox, paper, rot, tst, tss, tsx, tpl, title, subtitle, showStats, timeInk, sig, sigPos, artRef]);

  const brand = (
    <div className="tmap-brand">
      <span dangerouslySetInnerHTML={{ __html: LOGO_SVG }} style={{ display: 'contents' }} />
      <div className="tmap-bt"><b>ThoughtDAG</b></div>
    </div>
  );
  return (
    <div ref={artRef ?? selfRef} className={`tmap-art tmap-${paper} tmap-${tpl}`}
      style={{ ['--tmt' as string]: tst, ['--tms' as string]: tss, ['--tmx' as string]: tsx }} data-tmap-art>
      {tpl === 'scroll' ? (
        <>
          <div className="tmap-head">
            <div className="tmap-k">{KICKER[mapLang]}</div>
            {dateText && <div className="tmap-date">{dateText}</div>}
            {title && <h4 className="tmap-t">{title}</h4>}
            {subtitle && <div className="tmap-s">{subtitle}</div>}
            {sig && sigPos === 'byline' && <div className="tmap-sig-byline">{sig}</div>}
            {showStats && <>
              <div className="tmap-rule" />
              <div className="tmap-stats">
                {parts.map(([n, l, k], i) => (<span key={i}><StatGlyph kind={k} /><b>{n}</b> {l}<br /></span>))}
              </div>
            </>}
            <div className="tmap-spacer" />
            {brand}
          </div>
          <div className="tmap-graph" ref={boxRef} />
          {sig && sigPos === 'corner' && <div className="tmap-sig-corner">{sig}</div>}
        </>
      ) : (
        <>
          <div className="tmap-head">
            <div className="tmap-k">{KICKER[mapLang]}</div>
            {dateText && <div className="tmap-date">{dateText}</div>}
            {title && <h4 className="tmap-t">{title}</h4>}
            {subtitle && <div className="tmap-s">{subtitle}</div>}
            {sig && sigPos === 'byline' && <div className="tmap-sig-byline">{sig}</div>}
          </div>
          {brand}
          <div className="tmap-graph" ref={boxRef} />
          {sig && sigPos === 'corner' && <div className="tmap-sig-corner">{sig}</div>}
          <div className="tmap-footrow">
            {showStats
              ? <div className="tmap-statline">{parts.map(([n, l, k], i) => (<span key={i}>{i > 0 && ' · '}<span className="tmap-si"><StatGlyph kind={k} /><b>{n}</b> {l}</span></span>))}</div>
              : <div />}
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
  const [rot, setRot] = useState(false);
  const [paper, setPaper] = useState<'light' | 'dark'>('light');
  const [mapLang, setMapLang] = useState<'zh' | 'en'>('zh');
  const [capLang, setCapLang] = useState<'zh' | 'en'>('zh');
  const [tst, setTst] = useState(1.15);
  const [tss, setTss] = useState(1);
  const [tsx, setTsx] = useState(1);
  const [sig, setSig] = useState('');
  const [sigPos, setSigPos] = useState<'byline' | 'corner'>('byline');
  const [showStats, setShowStats] = useState(true);
  const [timeInk, setTimeInk] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [dateMode, setDateMode] = useState<'today' | 'span'>('span');
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
  // the archival stamp, compact (yy.mm.dd): today's date, or the
  // exploration's real span mined from node ids
  const dateText = useMemo(() => {
    if (!showDate) return '';
    const f = (d: Date) => `${String(d.getFullYear() % 100).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    if (dateMode === 'today') return f(new Date());
    const stamps = structure.nodes.map((n) => n.ts).filter((x): x is number => x != null);
    if (!stamps.length) return f(new Date());
    const a = new Date(Math.min(...stamps)), b = new Date(Math.max(...stamps));
    return f(a) === f(b) ? f(a) : `${f(a)}-${f(b)}`;
  }, [structure, showDate, dateMode]);

  useEffect(() => {
    if (!open) return;
    setStep('image');
    setMapLang(uiLang);
    setCapLang(uiLang);
    // the signature is identity, not content: remembered, never AI-drafted
    setSig(localStorage.getItem('thoughtdag.tmapSignature') ?? '');
    setSigPos((localStorage.getItem('thoughtdag.tmapSigPos') as 'byline' | 'corner') || 'byline');
    setTitle(clampWeight(projectName, TITLE_MAX));
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
  // root question and the map plaques (the already-distilled layer). The
  // model gets a budget UNDER the hard limits; the result is verified by
  // weight and retried once. An overlong field is dropped with a toast,
  // never truncated — a cut draft is no draft.
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
      const basePrompt = `You are naming a share image called a "thought map": a picture of how someone explored one question, node by node. Sources:\nRoot question: ${root}\nStep takeaways: ${plaques.join(' / ')}\nStructure: ${s}\n\nOutput STRICT JSON only, no code fence:\n{"title":"...","subtitle":"...","caption":"..."}\ntitle: in ${langName}, what this exploration was about, at most 16 CJK characters or 32 latin characters, evocative but concrete, no tool names.\nsubtitle: in ${langName}, one short line of context, at most 24 CJK characters or 48 latin characters.\ncaption: in ${capLangName}, 2 or 3 first-person sentences for a social post that WEAVE IN these numbers: ${capStats}. Calm and concrete, no hype, no hashtags, no emoji, no tool names.\nNever use dash characters anywhere; use commas or periods.`;
      let best: { title?: string; subtitle?: string; caption?: string } | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const raw = await llmCall([{
          role: 'user',
          content: attempt === 0 ? basePrompt
            : `${basePrompt}\nYour previous title or subtitle ran past the character budget. Cut deeper: title at most 12 CJK or 24 latin characters, subtitle at most 18 CJK or 36 latin characters.`,
        }]);
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) continue;
        try { best = JSON.parse(m[0]) as { title?: string; subtitle?: string; caption?: string }; } catch { continue; }
        const tOk = !best.title || textWeight(best.title) <= TITLE_MAX;
        const sOk = !best.subtitle || textWeight(best.subtitle) <= SUB_MAX;
        if (tOk && sOk) break;
      }
      if (!best) { toast('error', t('tmap.draftFailed')); return; }
      let dropped = false;
      if (best.title) { if (textWeight(best.title) <= TITLE_MAX) setTitle(best.title); else dropped = true; }
      if (best.subtitle) { if (textWeight(best.subtitle) <= SUB_MAX) setSubtitle(best.subtitle); else dropped = true; }
      if (best.caption) { capTouched.current = true; setCaption(`${best.caption.trim()}\n\n${attributionLine()}`); }
      if (dropped) toast('error', t('tmap.draftLong'));
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
    <div className="fixed inset-0 z-[85] bg-ink/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in" data-thought-map>
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-[min(1128px,96vw)] max-h-[95vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="text-sm font-semibold text-ink">{t('tmap.title')}{step === 'share' ? ` · ${t('tmap.shareStep')}` : ''}</div>
          <button onClick={close} className="w-7 h-7 rounded-lg text-ink-faint hover:bg-wash hover:text-ink flex items-center justify-center transition-colors">
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        {step === 'image' ? (
          <div className="flex gap-6 flex-wrap">
            {/* left: the words and the composition — where the hands live */}
            <div className="w-[252px] shrink-0 flex flex-col gap-3" style={{ minHeight: 690 }}>
              <div className="text-2xs font-mono tracking-[0.18em] uppercase text-ink-faint">{t('tmap.groupText')}</div>
              <div>
                <div className="text-2xs text-ink-faint mb-1 flex items-center justify-between">
                  <span>{t('tmap.publicTitle')}</span>
                  <button onClick={() => void draft()} disabled={drafting} data-tmap-draft
                    className="flex items-center gap-1 text-2xs text-accent hover:bg-accent/10 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-50">
                    {drafting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} strokeWidth={1.75} />}
                    {drafting ? t('tmap.drafting') : t('tmap.draft')}
                  </button>
                </div>
                <input value={title} onChange={(e) => setTitle(clampWeight(e.target.value, TITLE_MAX))} data-tmap-title placeholder={t('tmap.subtitlePh')}
                  className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40" />
                <div className="text-2xs text-ink-faint font-mono text-right mt-0.5">{textWeight(title)}/{TITLE_MAX}</div>
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.subtitle')}</div>
                <input value={subtitle} onChange={(e) => setSubtitle(clampWeight(e.target.value, SUB_MAX))} placeholder={t('tmap.subtitlePh')} data-tmap-subtitle
                  className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40" />
              </div>
              <div>
                <div className="text-2xs text-ink-faint mb-1">{t('tmap.sig')}</div>
                <input value={sig} placeholder={t('tmap.subtitlePh')} data-tmap-sig
                  onChange={(e) => { const v = clampWeight(e.target.value, 48); setSig(v); localStorage.setItem('thoughtdag.tmapSignature', v); }}
                  className="w-full border border-line rounded-lg px-3 py-1.5 text-xs bg-card text-ink placeholder-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-ink-faint w-[56px] shrink-0">{t('tmap.sigPos')}</span>
                <div className="flex-1">{seg([['byline', t('tmap.sigByline')], ['corner', t('tmap.sigCorner')]], sigPos, (v) => { setSigPos(v as 'byline' | 'corner'); localStorage.setItem('thoughtdag.tmapSigPos', v); })}</div>
              </div>
              <div className="text-2xs font-mono tracking-[0.18em] uppercase text-ink-faint mt-auto">{t('tmap.size')}</div>
              {([[t('tmap.slTitle'), tst, setTst], [t('tmap.slSub'), tss, setTss], [t('tmap.statsLbl'), tsx, setTsx]] as [string, number, (v: number) => void][]).map(([label, val, set]) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-2xs text-ink-faint w-[44px] shrink-0">{label}</span>
                  <input type="range" min={0.85} max={1.45} step={0.05} value={val} onChange={(e) => set(parseFloat(e.target.value))}
                    className="flex-1 accent-[color:var(--color-accent)]" />
                  <span className="text-2xs text-ink-faint font-mono w-[34px] text-right">{val.toFixed(2)}</span>
                </div>
              ))}
              <div className="text-2xs font-mono tracking-[0.18em] uppercase text-ink-faint mt-auto">{t('tmap.groupStyle')}</div>
              {([
                [t('tmap.layout'), [['tidy', t('tmap.tidy')], ['hand', t('tmap.hand')]], layout, (v: string) => setLayout(v as 'tidy' | 'hand')],
                [t('tmap.rotate'), [['off', t('tmap.rotOff')], ['on', t('tmap.rotOn')]], rot ? 'on' : 'off', (v: string) => setRot(v === 'on')],
                [t('tmap.paper'), [['light', t('tmap.paperLight')], ['dark', t('tmap.paperDark')]], paper, (v: string) => setPaper(v as 'light' | 'dark')],
                [t('tmap.mapLang'), [['zh', '中文'], ['en', 'EN']], mapLang, (v: string) => setMapLang(v as 'zh' | 'en')],
              ] as [string, [string, string][], string, (v: string) => void][]).map(([label, entries, cur, set]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-2xs text-ink-faint w-[56px] shrink-0">{label}</span>
                  <div className="flex-1">{seg(entries, cur, set)}</div>
                </div>
              ))}
            </div>
            {/* centre: the artifact, displayed at 1.2× (the design and the
                export stay 460×575 underneath — the wrapper only magnifies) */}
            <div className="shrink-0 rounded-md shadow-xl overflow-hidden" style={{ width: 552, height: 690 }}>
              <div style={{ transform: 'scale(1.2)', transformOrigin: 'top left', width: 460, height: 575 }}>
                <Artifact structure={structure} positions={positions} stats={stats}
                  title={title} subtitle={subtitle} mapLang={mapLang} paper={paper} rot={rot} tst={tst} tss={tss} tsx={tsx}
                  showStats={showStats} timeInk={timeInk} dateText={dateText} sig={sig} sigPos={sigPos} artRef={artRef} />
              </div>
            </div>
            {/* right: the honesty check on top, the marks below, the exit at the bottom */}
            <div className="w-[198px] shrink-0 flex flex-col gap-2" style={{ height: 690 }}>
              <div className="rounded-sm shadow-lg overflow-hidden self-center" style={{ width: 132, height: 165 }}>
                <div style={{ transform: 'scale(0.28695)', transformOrigin: 'top left', width: 460, height: 575 }}>
                  <Artifact structure={structure} positions={positions} stats={stats}
                    title={title} subtitle={subtitle} mapLang={mapLang} paper={paper} rot={rot} tst={tst} tss={tss} tsx={tsx}
                    showStats={showStats} timeInk={timeInk} dateText={dateText} sig={sig} sigPos={sigPos} />
                </div>
              </div>
              <div className="text-2xs text-ink-faint text-center mb-1">{t('tmap.thumbCap')}</div>
              <div className="text-2xs font-mono tracking-[0.18em] uppercase text-ink-faint">{t('tmap.groupMarks')}</div>
              {([
                [t('tmap.statsLbl'), [['on', t('tmap.show')], ['off', t('tmap.hide')]], showStats ? 'on' : 'off', (v: string) => setShowStats(v === 'on')],
                [t('tmap.timeInk'), [['off', t('tmap.hide')], ['on', t('tmap.show')]], timeInk ? 'on' : 'off', (v: string) => setTimeInk(v === 'on')],
                [t('tmap.dateLbl'), [['on', t('tmap.show')], ['off', t('tmap.hide')]], showDate ? 'on' : 'off', (v: string) => setShowDate(v === 'on')],
                [t('tmap.dateMode'), [['span', t('tmap.dateSpan')], ['today', t('tmap.dateToday')]], dateMode, (v: string) => setDateMode(v as 'today' | 'span')],
              ] as [string, [string, string][], string, (v: string) => void][]).map(([label, entries, cur, set], i) => (
                <div key={label} className={`flex items-center gap-2 ${i === 3 && !showDate ? 'opacity-40 pointer-events-none' : ''}`}>
                  <span className="text-2xs text-ink-faint w-[56px] shrink-0">{label}</span>
                  <div className="flex-1">{seg(entries, cur, set)}</div>
                </div>
              ))}
              <div className="flex-1" />
              <button onClick={() => { void downloadPng().then((ok) => { if (ok) setStep('share'); }); }} disabled={busy} data-tmap-download
                className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-accent text-white hover:bg-accent-strong rounded-lg px-3 py-2.5 transition-colors disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={1.75} />}
                {t('tmap.download')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-6 flex-wrap" data-tmap-share-step>
            <div className="shrink-0 flex flex-col gap-3" style={{ width: 184 }}>
              <div className="rounded-sm shadow-lg overflow-hidden" style={{ width: 184, height: 230 }}>
                <div style={{ transform: 'scale(0.4)', transformOrigin: 'top left', width: 460, height: 575 }}>
                  <Artifact structure={structure} positions={positions} stats={stats}
                    title={title} subtitle={subtitle} mapLang={mapLang} paper={paper} rot={rot} tst={tst} tss={tss} tsx={tsx}
                    showStats={showStats} timeInk={timeInk} dateText={dateText} sig={sig} sigPos={sigPos} artRef={artRef} />
                </div>
              </div>
              <button onClick={() => setStep('image')} data-tmap-back
                className="flex items-center justify-center gap-1.5 text-xs border border-line text-ink-muted hover:bg-wash rounded-lg px-3 py-2 transition-colors">
                <ArrowLeft size={13} strokeWidth={1.75} /> {t('tmap.backToImage')}
              </button>
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
            </div>
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
