// Hero scene 4: "your data, always portable" — real-UI backup narrative.
// Small staged canvas → mouse to top-right toolbar → open the local
// auto-backup control center (pre-faked as configured: folder + last write
// 2 min ago) → close → click "export backup (.json)" → success toast.
// Output: video/public/scene4.mp4 (1600×900, H.264, 30fps, ≥5.5s usable).
import { chromium } from '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main/node_modules/playwright-core/index.mjs';
import { mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main';
const RAW_DIR = '/tmp/hero-scene4-raw';
const OUT = `${ROOT}/video/public/scene4.mp4`;
rmSync(RAW_DIR, { recursive: true, force: true });
mkdirSync(RAW_DIR, { recursive: true });

const T = {
  rootQ: '为什么我收藏了几百篇文章，却几乎没回头读过？',
  rootA: '**成本不对称**：存下来几乎免费，读完很贵。收藏一秒完成，阅读要一整块时间。',
  rootS: '根因是成本不对称：存下来免费，读完很贵',
  ruleQ: '换个更强的收藏工具呢？',
  ruleA: '工具优化的是收藏那一秒，瓶颈在处理。此路不通。',
  ruleS: '换工具已排除：瓶颈在处理不在工具',
  insQ: '为什么收集本身让人满足？',
  insA: '收集触发预期奖励，拥有感成了「未来会学」的心理代餐。',
  insS: '收集的快感冒充理解的进度',
  decQ: '那从哪里改起？',
  decA: '拍板：新收藏当场写一句为什么。',
  decS: '拍板：收藏当场写一句为什么',
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW_DIR, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
const t0 = Date.now(); // recording starts with page creation
page.on('download', () => {}); // accept the export download silently

await page.addInitScript(() => {
  localStorage.setItem('thoughtdag.seeded', 'yes');
  localStorage.setItem('thoughtdag.lang', 'zh');
  localStorage.setItem('thoughtdag.memoryEnabled', 'off');
});
await page.route('**/api/**', async (route) => route.fulfill({
  status: 200, contentType: 'application/json',
  body: '{"models":[{"id":"m","name":"M","provider":"P","vision":false}],"default":"m"}',
}));
await page.goto('http://localhost:5173');
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');

// Stage a small canvas with takeaway plaques; pre-fake a configured backup.
await page.evaluate(({ T }) => {
  const mk = (id, x, y, q, a, s, type, extra = {}) => ({
    id, type: 'thought', position: { x, y }, dragHandle: '.drag-handle',
    data: { question: q, response: a, responses: [a], responseIndex: 0,
      summaries: [s], summaryTypes: [type],
      isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
      tokenCount: 40, highlights: [], highlightMode: 'tag', attachments: [],
      excludedAttachmentIds: [], includedAttachmentIds: [], roleMode: 'inherit', isRoot: false, isBranch: false, ...extra },
  });
  const E = (s2, t, branch) => ({ id: `e-${s2}-${t}`, source: s2, target: t,
    sourceHandle: branch ? 'branch' : 'continue', targetHandle: branch ? 'left' : 'top', type: 'smoothstep',
    animated: !!branch,
    style: { stroke: branch ? '#E08A3C' : '#6B5CE7', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: branch ? '#E08A3C' : '#6B5CE7', width: 18, height: 18 }, data: {} });
  window.__store.setState({
    nodes: [
      mk('root', 0, 0, T.rootQ, T.rootA, T.rootS, undefined, { isRoot: true }),
      mk('rule', 680, 80, T.ruleQ, T.ruleA, T.ruleS, 'ruleout', { isBranch: true }),
      mk('ins', 0, 430, T.insQ, T.insA, T.insS, undefined),
      mk('dec', 0, 860, T.decQ, T.decA, T.decS, 'decision'),
    ],
    edges: [E('root', 'rule', true), E('root', 'ins'), E('ins', 'dec')],
    selectedNodeIds: [], selectedNodeId: null,
  });
  // Backup pre-faked as already configured: folder + last write 2 min ago,
  // so the dialog shows real status instead of the setup guide.
  window.__ui.getState().setAutoBackupDir?.('Dropbox/Testthoughtdag');
  window.__ui.getState().setLastAutoBackupAt?.(Date.now() - 120000);
}, { T });
await page.waitForTimeout(500);

// Frame the canvas: cards readable at ~0.8 zoom, content weighted to the
// lower-left so the top-right toolbar stays clear.
await page.evaluate(() => {
  const zoom = 0.78;
  window.__rf.setViewport({ x: 55, y: 75, zoom });
});
await page.waitForTimeout(600);
const tReady = Date.now(); // trim point: everything staged, canvas at rest

// Hold on the canvas, then a real mouse glide to the backup entry.
await page.mouse.move(760, 620);
await page.waitForTimeout(1100);

const entry = page.locator('[data-backup-entry]');
const eb = await entry.boundingBox();
if (!eb) throw new Error('backup entry button not found');
await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2, { steps: 28 });
await page.waitForTimeout(200);
await page.mouse.down(); await page.mouse.up();

// Backup control center: folder + "last write 2 minutes ago".
await page.waitForSelector('[data-backup-dialog]');
await page.waitForTimeout(1500);

// Close by clicking the overlay, off to the lower-left of the dialog card.
await page.mouse.move(330, 700, { steps: 16 });
await page.mouse.down(); await page.mouse.up();
await page.waitForTimeout(400);

// Glide to the export button (Download icon, exact title) and click.
const exportBtn = page.locator('button[title="导出备份 (.json)"]');
const xb = await exportBtn.boundingBox();
if (!xb) throw new Error('export button not found');
await page.mouse.move(xb.x + xb.width / 2, xb.y + xb.height / 2, { steps: 24 });
await page.waitForTimeout(200);
await page.mouse.down(); await page.mouse.up();

// Success toast bottom-right; hold so the payoff lands.
await page.waitForTimeout(1800);

await page.close();
await context.close();
await browser.close();

// Transcode: trim the staging time, keep the performance.
const webm = readdirSync(RAW_DIR).find((f) => f.endsWith('.webm'));
if (!webm) throw new Error('no webm recorded');
const trim = Math.max(0, (tReady - t0) / 1000 - 0.4); // keep 0.4s of settled canvas
execSync(
  `/opt/homebrew/bin/ffmpeg -y -ss ${trim.toFixed(2)} -i ${RAW_DIR}/${webm} ` +
  `-c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -an ${OUT}`,
  { stdio: 'inherit' },
);
const dur = execSync(`/opt/homebrew/bin/ffprobe -v error -show_entries format=duration -of csv=p=0 ${OUT}`).toString().trim();
const size = statSync(OUT).size;
console.log(`scene4.mp4: ${dur}s, ${(size / 1024).toFixed(0)} KB (trimmed ${trim.toFixed(2)}s of staging)`);
if (parseFloat(dur) < 5) throw new Error(`too short: ${dur}s`);
