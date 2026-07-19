// Hero video · Scene 1 — "圈选原文，直接提问" / "Select the source, ask right there"
// Records the real app: load the example canvas → open the embedded PDF in
// the MaterialReader → drag-select the anchored sentence → the ask bar pops →
// type a question → the answer streams into the rail (store-paced, honest UI).
// Usage: node record-hero-scene1.mjs [zh|en]   (default zh)
// Output: video/public/scene1-<lang>.mp4 (1600×900, H.264, ≥6.5s effective).
import { chromium } from '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';

const LANG = process.argv[2] ?? 'zh';
if (LANG !== 'zh' && LANG !== 'en') throw new Error(`usage: node record-hero-scene1.mjs [zh|en] (got "${LANG}")`);

const ROOT = '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main';
const RAW_DIR = `${ROOT}/.local-e2e/scene1-raw-${LANG}`;
const OUT = `${ROOT}/video/public/scene1-${LANG}.mp4`;
mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(`${ROOT}/video/public`, { recursive: true });

const COPY = {
  zh: {
    question: '这段回路机制的证据是什么？',
    answer:
      '持续注意依赖工作记忆与外部线索的耦合回路。文中的双任务实验显示，移除外部线索后维持时间下降约 40%，说明回路的一半在环境里。',
    exampleBtn: '载入示例画布', // i18n zh.ts landing.loadExample
    exampleBtnFallback: '示例',
    fallbackFileText:
      '# 持续注意的回路机制\n\n持续注意的维持依赖工作记忆与外部线索的耦合回路：内部表征提供目标，环境线索按节拍把注意拉回目标。\n\n双任务实验显示，移除外部线索后，注意维持时间显著下降，说明回路的一半在环境里。',
  },
  en: {
    question: "What's the evidence for this loop mechanism?",
    answer:
      'Sustained attention rides a coupled loop of working memory and external cues. The dual-task experiments in the brief show retention dropping about 40% once external cues are removed — half the loop lives in the environment.',
    exampleBtn: 'Load example canvas', // i18n en.ts landing.loadExample
    exampleBtnFallback: 'example',
    fallbackFileText:
      '# The loop mechanism of sustained attention\n\nSustained attention rides a coupled loop of working memory and external cues: internal representations hold the goal, and environmental cues pull attention back to it on a beat.\n\nDual-task experiments show that removing external cues sharply shortens sustained attention — half the loop lives in the environment.',
  },
}[LANG];

const QUESTION = COPY.question;
const ANSWER = COPY.answer;
// sentence needles, in preference order (primary = the example brief's anchor
// line — English in the source PDF, so shared by both language takes)
const NEEDLES = ['The act of saving', '耦合回路', 'cost asymmetry'];

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: { dir: RAW_DIR, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
const tRecord = Date.now(); // recording starts ~when the page opens
page.setDefaultTimeout(20000);

await page.addInitScript((lang) => {
  localStorage.setItem('thoughtdag.seeded', 'yes');
  localStorage.setItem('thoughtdag.lang', lang);
  localStorage.setItem('thoughtdag.memoryEnabled', 'off');
  localStorage.setItem('thoughtdag.lastBackupAt', String(Date.now())); // no backup-nudge toast in frame
}, LANG);

await page.route('**/api/**', async (route) => {
  const req = route.request();
  if (req.method() === 'GET') {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: '{"models":[{"id":"m1","name":"GLM","provider":"P","vision":false}],"default":"m1"}',
    });
    return;
  }
  if (req.url().includes('/api/stream')) {
    // Never resolves during the take: the node keeps its honest loading state
    // while the store-paced streaming below writes the visible answer.
    await new Promise((r) => setTimeout(r, 120000));
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: [DONE]\n\n' }).catch(() => {});
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":"ok"}' });
});

await page.goto('http://localhost:5173');
// the reader modal should own the viewport — subject BIG (user feedback)
await page.addStyleTag({
  content: '[data-material-reader] > div { width: 97vw !important; height: 96vh !important; max-width: none !important; }',
});

// ── landing → example canvas ──
const exampleBtn = page.getByText(COPY.exampleBtn).first();
if (await exampleBtn.count()) {
  await exampleBtn.click();
} else {
  await page.getByText(COPY.exampleBtnFallback).first().click();
}
await page.waitForTimeout(2000);

// strip the pre-grown reading-loop nodes so our ask lands on a clean page
await page.evaluate(() => {
  const grown = ['brief-ask', 'brief-digest', 'ex-brief-ask', 'ex-brief-digest'];
  window.__store.setState((s) => ({
    nodes: s.nodes.filter((n) => !grown.includes(n.id)),
    edges: s.edges.filter((e) => !grown.includes(e.target) && !grown.includes(e.source)),
  }));
});
await page.waitForTimeout(300);

// ── open the reader on the file node (fallback: inject one) ──
let fileNodeId = await page.evaluate(() => {
  const f = window.__store.getState().nodes.find((n) => n.data.stepKind === 'file');
  return f?.id ?? null;
});
if (!fileNodeId) {
  fileNodeId = await page.evaluate((text) => {
    const id = `hero-file-${Date.now()}`;
    window.__store.setState((s) => ({
      nodes: [...s.nodes, {
        id, type: 'thought', position: { x: 200, y: 200 }, dragHandle: '.drag-handle',
        data: {
          question: '', instruction: '', stepKind: 'file',
          response: '', responses: [], responseIndex: -1,
          isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
          tokenCount: 0, highlights: [], highlightMode: 'tag',
          attachments: [{ id: `${id}-att`, name: 'attention-loop.pdf', type: 'application/pdf', size: 4096, content: '', extractedText: text, numPages: 1 }],
          excludedAttachmentIds: [], includedAttachmentIds: [],
          roleMode: 'inherit', isRoot: false, isBranch: false,
        },
      }],
    }));
    return id;
  }, COPY.fallbackFileText);
  await page.waitForTimeout(300);
}
await page.evaluate((id) => window.__ui.getState().setReaderNodeId(id), fileNodeId);
// PDF text layer (original view) or text-view fallback
const surface = await Promise.race([
  page.waitForSelector('.tdag-textlayer span', { timeout: 12000 }).then(() => 'pdf').catch(() => null),
  page.waitForSelector('[data-material-reader] [data-page]', { timeout: 12000 }).then(() => 'any').catch(() => null),
]);
if (!surface) throw new Error('reader surface never appeared');
await page.waitForTimeout(1500); // let the PDF paint fully

// ── locate the sentence, bring it to the upper-middle of the frame ──
const target = await page.evaluate((needles) => {
  const reader = document.querySelector('[data-material-reader]');
  if (!reader) return null;
  // prefer PDF text-layer spans (real selectable original)
  for (const needle of needles) {
    const span = [...reader.querySelectorAll('.tdag-textlayer span')].find((s) => s.textContent?.includes(needle));
    if (span) {
      span.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = span.getBoundingClientRect();
      return { kind: 'span', needle, x1: r.left + 2, y: r.top + r.height / 2, x2: r.right - 2 };
    }
  }
  // fallback: any visible text node in the reader body
  const walker = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    for (const needle of needles) {
      const i = node.textContent?.indexOf(needle) ?? -1;
      if (i >= 0 && node.parentElement?.offsetParent) {
        node.parentElement.scrollIntoView({ block: 'center', behavior: 'instant' });
        return { kind: 'range', needle, i };
      }
    }
  }
  return null;
}, NEEDLES);
if (!target) throw new Error('anchor sentence not found in the reader');
await page.waitForTimeout(400);

// ── fake cursor (recordVideo captures no OS cursor) ──
await page.evaluate(() => {
  const c = document.createElement('div');
  c.id = 'fake-cursor';
  c.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;pointer-events:none;left:-60px;top:-60px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))';
  c.innerHTML = '<svg viewBox="0 0 24 24" fill="white" stroke="black" stroke-width="1.5"><path d="M4 2 L4 19 L9 15 L12 22 L15 20.5 L12 14 L19 13.5 Z"/></svg>';
  document.body.appendChild(c);
});
let cx = 820, cy = 860;
const setCursor = (x, y) => page.evaluate(([a, b]) => {
  const c = document.getElementById('fake-cursor');
  if (c) { c.style.left = `${a}px`; c.style.top = `${b}px`; }
}, [x, y]);
const glide = async (x, y, steps = 10, dwell = 28) => {
  for (let i = 1; i <= steps; i++) {
    const nx = cx + (x - cx) * (i / steps), ny = cy + (y - cy) * (i / steps);
    await page.mouse.move(nx, ny);
    await setCursor(nx, ny);
    await page.waitForTimeout(dwell);
  }
  cx = x; cy = y;
};
await setCursor(cx, cy);

const tAction = Date.now(); // ← effective footage starts here
await page.waitForTimeout(300);

// ── drag-select the sentence (real selection paint) ──
if (target.kind === 'span') {
  await glide(target.x1, target.y, 9);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) {
    const nx = target.x1 + (target.x2 - target.x1) * (i / 16);
    await page.mouse.move(nx, target.y);
    await setCursor(nx, target.y);
    await page.waitForTimeout(45);
  }
  await page.mouse.up();
  cx = target.x2; cy = target.y;
} else {
  // synthetic Range + dispatched mouseup (text-view fallback)
  await page.evaluate(([needle]) => {
    const reader = document.querySelector('[data-material-reader]');
    const walker = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent?.indexOf(needle) ?? -1;
      if (i >= 0 && node.parentElement?.offsetParent) {
        const r = document.createRange();
        r.setStart(node, i);
        r.setEnd(node, Math.min(node.textContent.length, i + needle.length + 20));
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        node.parentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
    }
  }, [target.needle]);
}
await page.waitForSelector('[data-reader-askbar] textarea', { timeout: 5000 });
await page.waitForTimeout(800); // the ask bar sits under the selection

// ── type the question (keep the selection highlight visible: focus, no click) ──
const bar = await page.locator('[data-reader-askbar]').boundingBox();
if (bar) await glide(bar.x + bar.width * 0.4, bar.y + bar.height * 0.5, 8);
await page.evaluate(() => document.querySelector('[data-reader-askbar] textarea')?.focus());
await page.keyboard.type(QUESTION, { delay: 30 });
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(800); // the node lands, the rail opens on the thread

// ── the answer streams in (store-paced; the pending /api/stream keeps isLoading honest) ──
const askId = await page.evaluate(() =>
  window.__store.getState().selectedNodeId ?? window.__store.getState().nodes.at(-1)?.id);
if (!askId) throw new Error('fresh ask node not found');
const STEPS = 12;
for (let i = 1; i <= STEPS; i++) {
  const partial = ANSWER.slice(0, Math.ceil((ANSWER.length * i) / STEPS));
  await page.evaluate(([id, text]) => {
    window.__store.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, response: text, isLoading: true } } : n)),
    }));
  }, [askId, partial]);
  await page.waitForTimeout(120);
}
await page.evaluate(([id, full]) => {
  window.__store.setState((s) => ({
    nodes: s.nodes.map((n) => (n.id === id
      ? { ...n, data: { ...n.data, response: full, responses: [full], responseIndex: 0, isLoading: false } }
      : n)),
  }));
}, [askId, ANSWER]);
await page.waitForTimeout(1200); // settle on the finished answer

const tEnd = Date.now();
const video = page.video();
await context.close(); // flushes the webm
await browser.close();
const webm = await video.path();

// ── trim + transcode: effective footage starts ~0.5s before the drag ──
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const rawDur = probe(webm);
const offset = (tAction - tRecord) / 1000;
const effective = (tEnd - tAction) / 1000;
let trim = Math.max(0, offset - 0.5);
trim = Math.min(trim, Math.max(0, rawDur - 6.8)); // never trim below 6.8s remaining
execFileSync('ffmpeg', ['-y', '-ss', trim.toFixed(2), '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', '30', '-an', OUT], { stdio: 'inherit' });
const outDur = probe(OUT);
const outSize = statSync(OUT).size;
console.log(JSON.stringify({ lang: LANG, webm, rawDur, offset, effective, trim, outDur, outSizeKB: Math.round(outSize / 1024) }, null, 2));
if (outDur < 6 || outSize < 200 * 1024) throw new Error(`verify failed: dur=${outDur}s size=${outSize}B`);
console.log(`scene1-${LANG}.mp4 OK`);
