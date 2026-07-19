// Hero video — Scene 2: "delete an edge, change an answer".
// Three-card canvas (A research root, B noise, C summary polluted by B).
// Real mouse selects the B→C edge, clicks the floating X to delete it,
// then C re-streams a clean answer (store-driven). Output: video/public/scene2.mp4
import { chromium } from '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main';
const SCRATCH = '/private/tmp/claude-501/-Users-chatchan-Library-CloudStorage-Dropbox-Academic-1-Postdoc-ResearchIdeas-thoughtdag-main/8d9eb892-d9e7-4beb-b06f-d05137fa2c7a/scratchpad/scene2';
const OUT = `${ROOT}/video/public/scene2.mp4`;
mkdirSync(SCRATCH, { recursive: true });

const CLEAN = '要点一：检索式要含同义词扩展。\n\n要点二：双人独立筛选。\n\n要点三：冲突由第三人仲裁。';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: SCRATCH, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
const tRec = Date.now();

await page.addInitScript(() => {
  localStorage.setItem('thoughtdag.seeded', 'yes');
  localStorage.setItem('thoughtdag.lang', 'zh');
  localStorage.setItem('thoughtdag.memoryEnabled', 'off');
});
await page.route('**/api/**', async (route) => {
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: route.request().method() === 'POST'
      ? '{"text":"ok"}'
      : '{"models":[{"id":"m1","name":"M","provider":"P","vision":false}],"default":"m1"}',
  });
});
await page.goto('http://localhost:5173');
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');

// ── Seed the three-card canvas ────────────────────────────────────────────
await page.evaluate(() => {
  const base = (id, x, y, q, a, extra = {}) => ({
    id, type: 'thought', position: { x, y }, dragHandle: '.drag-handle',
    data: {
      question: q, response: a, responses: [a], responseIndex: 0,
      isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
      tokenCount: 60, highlights: [], highlightMode: 'tag', attachments: [],
      excludedAttachmentIds: [], includedAttachmentIds: [], roleMode: 'inherit',
      isRoot: false, isBranch: false, ...extra,
    },
  });
  window.__store.setState({
    nodes: [
      base('A', 0, 0, '系统综述的检索策略',
        '先在两个主要数据库各建一条检索式，主题词加同义词扩展，再用引文追溯补充遗漏。检索日期与数据库版本都要记录，保证可复现。',
        { isRoot: true }),
      base('B', 620, 40, '今晚吃什么',
        '火锅吧，或者烤肉。楼下那家新开的串串也不错，人少的话随到随吃。'),
      base('C', 0, 420, '给我一份要点总结',
        '要点一：检索式要含同义词扩展。\n\n要点二：双人独立筛选。\n\n另外，晚饭可以考虑火锅。'),
    ],
    edges: [
      { id: 'eAC', source: 'A', target: 'C', sourceHandle: 'continue', targetHandle: 'top', type: 'smoothstep', data: {} },
      { id: 'eBC', source: 'B', target: 'C', sourceHandle: 'continue', targetHandle: 'top', type: 'smoothstep', data: {} },
    ],
    selectedNodeIds: [], selectedNodeId: null,
  });
});
await page.waitForTimeout(700);

// ── Frame the shot: fit the 3-card union large and centered ───────────────
await page.evaluate(() => {
  const ns = window.__rf.getNodes();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of ns) {
    const w = n.measured?.width ?? 520, h = n.measured?.height ?? 220;
    x0 = Math.min(x0, n.position.x); y0 = Math.min(y0, n.position.y);
    x1 = Math.max(x1, n.position.x + w); y1 = Math.max(y1, n.position.y + h);
  }
  const z = Math.min(1.05, (1600 - 150) / (x1 - x0), (900 - 130) / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  window.__rf.setViewport({ x: 800 - cx * z, y: 450 - cy * z, zoom: z });
});
await page.waitForTimeout(500);

// ── Fake cursor (recordVideo does not capture the OS pointer) ─────────────
await page.evaluate(() => {
  const c = document.createElement('div');
  c.id = 'fake-cursor';
  c.style.cssText = 'position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(107,92,231,.28);border:2.5px solid #6B5CE7;z-index:99999;pointer-events:none;transform:translate(-50%,-50%);left:-60px;top:-60px;';
  document.body.appendChild(c);
});
const cursorTo = (x, y) => page.evaluate(([x2, y2]) => {
  const c = document.getElementById('fake-cursor');
  c.style.left = x2 + 'px'; c.style.top = y2 + 'px';
}, [x, y]);
const clickPulse = () => page.evaluate(() => {
  const c = document.getElementById('fake-cursor');
  c.style.transition = 'transform .12s'; c.style.transform = 'translate(-50%,-50%) scale(.6)';
  setTimeout(() => { c.style.transform = 'translate(-50%,-50%) scale(1)'; }, 130);
});
const glide = async (from, to, steps, dwell = 28) => {
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * (i / steps);
    const y = from.y + (to.y - from.y) * (i / steps);
    await page.mouse.move(x, y);
    await cursorTo(x, y);
    await page.waitForTimeout(dwell);
  }
};

const tScene = Date.now(); // trim point: everything before this is setup

// 1) Hold — let the viewer read the three cards (the hotpot noise in C).
await page.waitForTimeout(1200);

// 2) Real-mouse click on the B→C edge midpoint to select it.
const mid = await page.evaluate(() => {
  const g = document.querySelector('.react-flow__edge[data-id="eBC"]')
    ?? document.querySelectorAll('.react-flow__edge')[1];
  const p = g.querySelector('path.react-flow__edge-path');
  const pt = p.getPointAtLength(p.getTotalLength() / 2);
  const sp = new DOMPoint(pt.x, pt.y).matrixTransform(p.getScreenCTM());
  return { x: sp.x, y: sp.y };
});
await glide({ x: mid.x + 260, y: mid.y - 160 }, mid, 12);
await page.mouse.click(mid.x, mid.y);
await clickPulse();
await page.waitForTimeout(600); // floating chip + X appear

// 3) Click the floating delete (X) button — real mouse.
const delBtn = page.locator('button[title="删除连线（或按 Delete 键）"]');
await delBtn.waitFor({ state: 'visible', timeout: 3000 });
const bb = await delBtn.boundingBox();
const target = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
await glide(mid, target, 8);
await page.mouse.click(target.x, target.y);
await clickPulse();
await page.waitForTimeout(800); // edge gone

// Park the cursor clear of C's card so the re-stream is unobstructed.
const park = await page.evaluate(() => {
  const r = document.querySelector('[data-id="C"]').getBoundingClientRect();
  return { x: Math.min(r.right + 90, 1560), y: r.top + r.height * 0.5 };
});
await glide(target, park, 6, 24);

// 4) C re-streams a clean answer (store-driven simulation of a rerun).
const patchC = (patch) => page.evaluate(([p]) => {
  const s = window.__store.getState();
  window.__store.setState({
    nodes: s.nodes.map((n) => n.id === 'C' ? { ...n, data: { ...n.data, ...p } } : n),
  });
}, [patch]);

await patchC({ isLoading: true, response: '', reasoning: '', restreaming: false });
await page.waitForTimeout(450); // "thinking" pulse
for (let i = 1; i <= 10; i++) {
  await patchC({ response: CLEAN.slice(0, Math.ceil((CLEAN.length * i) / 10)) });
  await page.waitForTimeout(120);
}
await patchC({ isLoading: false, response: CLEAN, responses: [CLEAN], responseIndex: 0, tokenCount: 70 });

// 5) Hold on the clean summary — the hotpot line is gone.
await page.waitForTimeout(1500);

const video = page.video();
await context.close();
const webm = await video.path();
await browser.close();

// ── Transcode: trim the setup lead, webm → H.264 mp4 ─────────────────────
const offset = Math.max(0, (tScene - tRec) / 1000 - 0.2);
execSync(`/opt/homebrew/bin/ffmpeg -y -ss ${offset.toFixed(2)} -i "${webm}" -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -movflags +faststart "${OUT}"`, { stdio: 'inherit' });
const probe = execSync(`/opt/homebrew/bin/ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "${OUT}"`).toString().trim();
console.log(`scene2.mp4 → ${probe}`);
