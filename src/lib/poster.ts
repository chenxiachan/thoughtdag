import { useStore } from '../store';
import { collectTimeline, type TimelineEntry } from './timeline';
import { generateGedankengang, getCached, graphFingerprint, type Gedankengang } from './gedankengang';

// The Gedankengang poster: the timeline overview rendered as a manuscript
// chronicle — paper ground, serif ink, badge seals strung on a spine, the
// journey paragraph up top, a vermilion chop at the foot. Drawn on a canvas
// (not screenshotted) so it exports clean at 2x on any screen. Everything
// it shows is already on the map; the poster is the takeaway you can post.

const W = 1080;
const PAD = 90;
const DPR = 2;

const SEAL: Record<string, { color: string; glyph: string }> = {
  ruleout: { color: '#d4574e', glyph: '✕' },
  decision: { color: '#5f51cf', glyph: '⚖' },
  pivot: { color: '#e8890c', glyph: '↩' },
  open: { color: '#d97706', glyph: '?' },
  insight: { color: '#25a06b', glyph: '✦' },
};

const SERIF = "'Songti SC', 'Noto Serif SC', Georgia, serif";
const MONO = "'SF Mono', Menlo, monospace";

/** Greedy wrap that treats every CJK glyph as a break point. Closing
    punctuation never starts a line — it hangs onto the full line instead. */
const NO_LINE_HEAD = '。，、；：？！）」』】…';
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const probe = line + ch;
    if (ctx.measureText(probe).width > maxW && line) {
      if (NO_LINE_HEAD.includes(ch)) { lines.push(probe); line = ''; continue; }
      lines.push(line);
      line = ch === ' ' ? '' : ch;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type PosterInput = {
  title: string;
  journey?: string;
  entries: (TimelineEntry & { type?: string })[];
  lang: 'zh' | 'en';
};

/** Chronicle thinning: a poster tells the story of the TURNS, not the full
    log. Small maps print whole; past the cap, badged turns plus the first
    and last steps survive, and every run of skipped waypoints collapses to
    its count (an ellipsis row — the chronicle's 中略). */
export const POSTER_ENTRY_CAP = 22;
export function thinEntries<T extends { badged: boolean }>(entries: T[]): (T | number)[] {
  if (entries.length <= POSTER_ENTRY_CAP) return entries;
  const out: (T | number)[] = [];
  let skipped = 0;
  entries.forEach((e, i) => {
    if (e.badged || i === 0 || i === entries.length - 1) {
      if (skipped > 0) { out.push(skipped); skipped = 0; }
      out.push(e);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push(skipped);
  return out;
}

export async function drawGedankengangPoster({ title, journey, entries, lang }: PosterInput): Promise<Blob> {
  // ── measure pass: compute the height before allocating the canvas ──
  const probe = document.createElement('canvas').getContext('2d')!;
  const textW = W - PAD * 2;

  probe.font = `700 52px ${SERIF}`;
  const titleLines = wrapText(probe, title, textW).slice(0, 3);
  probe.font = `italic 30px ${SERIF}`;
  const journeyLines = journey ? wrapText(probe, journey, textW) : [];

  const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '');
  probe.font = `28px ${SERIF}`;
  type Row =
    | { kind: 'day'; label: string }
    | { kind: 'entry'; e: PosterInput['entries'][number]; lines: string[] }
    | { kind: 'skip'; n: number };
  const kept = thinEntries(entries);
  const rows: Row[] = [];
  let prevDay = '§';
  for (const item of kept) {
    if (typeof item === 'number') {
      rows.push({ kind: 'skip', n: item });
      continue;
    }
    const day = dayOf(item.createdAt);
    if (day !== prevDay) {
      rows.push({ kind: 'day', label: day || (lang === 'zh' ? '无时间' : 'Undated') });
      prevDay = day;
    }
    rows.push({ kind: 'entry', e: item, lines: wrapText(probe, item.label || '…', textW - 96).slice(0, 2) });
  }

  const headerH = 150 + titleLines.length * 64 + 30;
  const journeyH = journeyLines.length > 0 ? journeyLines.length * 44 + 70 : 0;
  const rowsH = rows.reduce((h, r) => h + (r.kind === 'day' ? 78 : r.kind === 'skip' ? 56 : Math.max(76, 30 + r.lines.length * 38)), 0);
  const footerH = 190;
  // Content-driven height: the chronicle ends and the chop follows — no
  // dead paper between them. The floor only guards absurdly short maps.
  const H = Math.max(1000, headerH + journeyH + rowsH + footerH);

  // ── draw pass ──
  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(DPR, DPR);

  // paper + faint ruling
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,100,60,.06)';
  ctx.lineWidth = 1;
  for (let y = 60; y < H; y += 44) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  let y = 96;
  ctx.fillStyle = '#a08d5f';
  ctx.font = `500 22px ${MONO}`;
  const eyebrow = 'G E D A N K E N G A N G';
  ctx.fillText(eyebrow, PAD, y);
  y += 58;

  ctx.fillStyle = '#2b2416';
  ctx.font = `700 52px ${SERIF}`;
  for (const l of titleLines) { ctx.fillText(l, PAD, y); y += 64; }

  const days = entries.map((e) => dayOf(e.createdAt)).filter(Boolean);
  if (days.length) {
    ctx.fillStyle = '#a08d5f';
    ctx.font = `20px ${MONO}`;
    ctx.fillText(days[0] === days[days.length - 1] ? days[0] : `${days[0]} → ${days[days.length - 1]}`, PAD, y);
  }
  y += 30;

  if (journeyLines.length) {
    y += 34;
    ctx.strokeStyle = 'rgba(140,47,38,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(PAD, y - 26); ctx.lineTo(PAD, y - 30 + journeyLines.length * 44); ctx.stroke();
    ctx.fillStyle = '#5c4d31';
    ctx.font = `italic 30px ${SERIF}`;
    for (const l of journeyLines) { ctx.fillText(l, PAD + 30, y); y += 44; }
    y += 36;
  }

  // spine first — the seals sit ON it
  const spineX = PAD + 26;
  const spineTop = y + 6;
  ctx.strokeStyle = 'rgba(74,61,38,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(spineX, spineTop); ctx.lineTo(spineX, spineTop + rowsH - 36); ctx.stroke();

  for (const r of rows) {
    if (r.kind === 'day') {
      y += 50;
      ctx.fillStyle = '#a08d5f';
      ctx.font = `600 22px ${MONO}`;
      ctx.fillText(r.label, PAD + 70, y);
      y += 28;
      continue;
    }
    if (r.kind === 'skip') {
      const cy = y + 28;
      ctx.fillStyle = '#a89a78';
      ctx.beginPath(); ctx.arc(spineX, cy - 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.font = `italic 24px ${SERIF}`;
      ctx.fillText(lang === 'zh' ? `⋯ 中略 ${r.n} 步` : `⋯ ${r.n} steps pass`, PAD + 70, cy);
      y += 56;
      continue;
    }
    const rowH = Math.max(76, 30 + r.lines.length * 38);
    const cy = y + rowH / 2 - 6;
    const seal = (r.e.type && SEAL[r.e.type]) || null;
    if (seal && r.e.badged) {
      ctx.fillStyle = seal.color;
      const s = 46;
      ctx.beginPath();
      ctx.roundRect(spineX - s / 2, cy - s / 2, s, s, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `26px ${SERIF}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(seal.glyph, spineX, cy + 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else {
      ctx.fillStyle = seal ? seal.color : '#b8b3c7';
      ctx.beginPath();
      ctx.arc(spineX, cy, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = r.e.badged ? '#2b2416' : '#6d5f42';
    ctx.font = `${r.e.badged ? 600 : 400} 28px ${SERIF}`;
    let ty = y + 40;
    for (const l of r.lines) { ctx.fillText(l, PAD + 70, ty); ty += 38; }
    y += rowH;
  }

  // footer: chop + attribution
  const fy = H - 96;
  ctx.save();
  ctx.translate(PAD + 34, fy - 10);
  ctx.rotate(-0.07);
  ctx.fillStyle = '#8c2f26';
  ctx.beginPath(); ctx.roundRect(-30, -30, 60, 60, 9); ctx.fill();
  ctx.fillStyle = '#f7f3ea';
  ctx.font = `700 34px ${SERIF}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('思', 0, 3);
  ctx.restore();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7d6a45';
  ctx.font = `20px ${MONO}`;
  ctx.fillText('ThoughtDAG · github.com/chenxiachan/thoughtdag', PAD + 90, fy);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/** One-call export used by every poster entry point (timeline overview,
    share dialog): ensure a journey paragraph (cached or freshly written —
    the chronicle alone still makes a poster if the call fails), draw, and
    hand the PNG to the browser as a download. */
export async function exportGedankengangPoster(
  lang: 'zh' | 'en',
  hooks?: { onJourney?: (g: Gedankengang) => void },
): Promise<void> {
  const { nodes, edges } = useStore.getState();
  const fp = graphFingerprint(nodes);
  let journey = getCached(fp, lang)?.text;
  if (!journey) {
    try {
      const g = await generateGedankengang(nodes, edges, lang);
      hooks?.onJourney?.(g);
      journey = g.text;
    } catch { /* proceed without the paragraph */ }
  }
  const root = nodes.find((n) => n.data.isRoot);
  const blob = await drawGedankengangPoster({
    title: (root?.data.question ?? 'ThoughtDAG').replace(/\s+/g, ' ').slice(0, 80),
    journey,
    entries: collectTimeline(nodes, 0),
    lang,
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'thoughtdag-gedankengang.png';
  a.click();
  URL.revokeObjectURL(a.href);
}
