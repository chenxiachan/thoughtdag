// Hero scene 3 — semantic zoom: work cards → takeaway plaques → glyph seals.
// One continuous camera pull-back over a staged canvas, center locked.
// Output: video/public/scene3.mp4 (1600×900, h264, 30fps, ~8s).
import { chromium } from '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main/node_modules/playwright-core/index.mjs';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = '/Users/chatchan/Library/CloudStorage/Dropbox/Academic/1_Postdoc/ResearchIdeas/thoughtdag-main';
const SCRATCH = '/private/tmp/claude-501/-Users-chatchan-Library-CloudStorage-Dropbox-Academic-1-Postdoc-ResearchIdeas-thoughtdag-main/8d9eb892-d9e7-4beb-b06f-d05137fa2c7a/scratchpad';
const RAW = `${SCRATCH}/scene3-raw`;
const OUT = `${ROOT}/video/public/scene3.mp4`;
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const FFPROBE = '/opt/homebrew/bin/ffprobe';
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

const W = 1600, H = 900;
// world center to lock (middle-column card sits here) — x = W/2 - cx*z, y = H/2 - cy*z
const CX = 940, CY = 780;

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: RAW, size: { width: W, height: H } },
});
const page = await context.newPage();
const tPageOpen = Date.now();
await page.addInitScript(() => {
  localStorage.setItem('thoughtdag.seeded', 'yes');
  localStorage.setItem('thoughtdag.lang', 'zh');
  localStorage.setItem('thoughtdag.memoryEnabled', 'off');
});
await page.route('**/api/**', async (route) => {
  if (route.request().method() !== 'POST') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[{"id":"mock-model","name":"Mock","provider":"Mock","vision":false}],"default":"mock-model"}' });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"text":""}' });
});
await page.goto('http://localhost:5173');
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');

// ── stage the canvas: 7 nodes, 3 columns, two chains + one offshoot ──
await page.evaluate(() => {
  const mk = (id, x, y, q, a, s, type, extra = {}) => ({
    id, type: 'thought', position: { x, y }, dragHandle: '.drag-handle',
    data: {
      question: q, response: a, responses: [a], responseIndex: 0,
      summaries: [s], summaryTypes: [type],
      isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
      tokenCount: 40, highlights: [], highlightMode: 'tag', attachments: [],
      excludedAttachmentIds: [], includedAttachmentIds: [], roleMode: 'inherit',
      isRoot: false, isBranch: false, ...extra,
    },
  });
  const E = (s2, t, branch) => ({
    id: `e-${s2}-${t}`, source: s2, target: t,
    sourceHandle: branch ? 'branch' : 'continue', targetHandle: branch ? 'left' : 'top',
    type: 'smoothstep', animated: !!branch,
    style: { stroke: branch ? '#E08A3C' : '#6B5CE7', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: branch ? '#E08A3C' : '#6B5CE7', width: 18, height: 18 },
    data: {},
  });
  window.__store.setState({
    nodes: [
      mk('root', 0, 0,
        '为什么我收藏了几百篇文章，却几乎一篇都没回头读过？',
        '三股力量叠在一起：\n\n1. **成本不对称**：存下来几乎免费，读完很贵。收藏一秒钟完成，还立刻发一点「已处理」的小奖励；阅读要一整块时间，回报却在远处。\n2. **没有浮现机制**：收藏夹是只进不出的仓库，没有任何东西负责把旧条目推回你眼前。\n3. **收藏时的自己过度乐观**：存的是给「未来有空的我」读的，而那个我从不出现。\n\n于是书库默认膨胀：增长发生在动作最便宜的那一端。',
        '根因是成本不对称：存下来几乎免费，读完很贵', undefined, { isRoot: true }),
      mk('name', 0, 620,
        '这种「收藏了就等于读了」的错觉，有正式的名字吗？',
        '有，通常叫**收藏家谬误**（collector’s fallacy）：收集一份材料带来即时的进度感，而它允诺的理解被无限期推迟。研究里更极端的形态叫**数字囤积**：无差别保存、从不整理、一删就焦虑。\n\n两者的共同点：**收集的快感冒充了理解的进度**。系统一（快、省力）负责存，系统二（慢、费力）才负责读——「存」这个动作天然获胜。',
        '它有名字：收藏家谬误——收集的快感冒充理解的进度', 'insight'),
      mk('dec', 0, 1240,
        '那这 847 条旧收藏该怎么处置？',
        '数据先说话：一年只回访过 3 条，这个书库**作为学习工具已经死了**；但十几次检索型使用说明它**作为索引还活着**。\n\n处置方案：\n1. **旧账整体归档**：不删除（保住检索价值），但移出「待读」心理账户，宣布阅读破产。\n2. **新收藏换协议**：存的那一刻写一句「为什么重要」；写不出来，就不配存。',
        '拍板：旧收藏整体归档，新收藏当场写一句为什么', 'decision'),
      mk('ruleout', 680, 80,
        '那我换一个更强大的收藏工具，问题不就解决了？',
        '大概率不会。工具优化的是**收藏那一秒**：更快的剪藏、更好的标签、更全的同步。但瓶颈全部在**处理**：什么时候读、读完留下什么、下次怎么被想起。\n\n换工具常常还有反效果——迁移期的整理幻觉又发一轮「在进步」的奖励，而书库只是换了个地址继续膨胀。\n\n**这条路可以排除了：不是工具不够好，是环路方向错了。**',
        '换工具解决不了囤积：瓶颈在处理不在工具', 'ruleout',
        { isBranch: true, branchContext: '存下来几乎免费，读完很贵' }),
      mk('ins', 680, 700,
        '为什么收集这个动作本身就能带来满足感？',
        '因为它触发的是**预期奖励**：拿到一份「将来会有用」的材料时，奖励系统对**可能性**放电，而不是对实际收益放电。拥有感于是成了学习的心理代餐——材料在手，仿佛知识已在途中。\n\n实体收藏时代，这个循环被物理成本约束着；数字收藏把边际成本压到零，循环就没了刹车。',
        '收集触发预期奖励：拥有感成了「未来会学」的心理代餐', 'insight'),
      mk('pivot', 680, 1320,
        '所以问题从一开始就问错了？',
        '对。「用什么存、怎么整理」优化的都是仓库；而仓库从来不是瓶颈。真正的变量只有一个：**读的那一刻什么时候发生**。\n\n把问题从「存什么」换成「何时读」，答案立刻具体起来——读的时机必须被**预先决定**（收藏当下、每周固定回访），而不是寄希望于某个「有空的未来」。存是仓储问题，读才是日程问题。',
        '转向：从「存什么」转向「何时读」，处理前置到收藏那一刻', 'pivot'),
      mk('rule3', 1360, 700,
        '有没有一条当场就能执行的小规矩？',
        '**三分钟法则**：遇到想收藏的东西，先花三分钟扫读。\n\n- 三分钟内能读完的：**当场读掉**，不进收藏夹。\n- 三分钟读不完但说得出「为什么重要」的：存，并把那句话写进备注。\n- 说不出来的：**当场删掉**。\n\n它把处理成本从「未来的一小时」换成「现在的三分钟」，正好打在成本不对称的骨节上。',
        '三分钟法则：三分钟内读或当场删，处理成本付在当下', 'decision',
        { isBranch: true, branchContext: '预期奖励' }),
    ],
    edges: [
      E('root', 'name'), E('name', 'dec'),
      E('root', 'ruleout', true), E('ruleout', 'ins'), E('ins', 'pivot'),
      E('ins', 'rule3', true),
    ],
    selectedNodeIds: [], selectedNodeId: null,
  });
});
await page.waitForTimeout(400);

// camera helpers — center-locked viewport
const setZ = (z) => page.evaluate(({ z, CX, CY, W, H }) => {
  window.__rf.setViewport({ x: W / 2 - CX * z, y: H / 2 - CY * z, zoom: z });
}, { z, CX, CY, W, H });
// smooth in-browser rAF glide, exponential zoom interpolation + ease-in-out
const glide = (z0, z1, dur) => page.evaluate(({ z0, z1, dur, CX, CY, W, H }) => new Promise((res) => {
  const t0 = performance.now();
  const step = (now) => {
    let t = (now - t0) / dur; if (t > 1) t = 1;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    const z = z0 * Math.pow(z1 / z0, e);
    window.__rf.setViewport({ x: W / 2 - CX * z, y: H / 2 - CY * z, zoom: z });
    if (t < 1) requestAnimationFrame(step); else res();
  };
  requestAnimationFrame(step);
}), { z0, z1, dur, CX, CY, W, H });
const tier = () => page.evaluate(() => document.querySelector('.react-flow')?.getAttribute('data-zoom-tier'));

// park at the start frame, let everything settle, then mark choreography start
await setZ(1.1);
await page.waitForTimeout(900);
const tStart = Date.now();

// ① work tier hold — full cards, readable
await page.waitForTimeout(1200);
console.log('tier@1.10:', await tier());
await page.screenshot({ path: `${SCRATCH}/s3-work.png` });

// ② glide to map tier (plaques with badges), hold
await glide(1.1, 0.55, 1500);
await page.waitForTimeout(1200);
console.log('tier@0.55:', await tier());
await page.screenshot({ path: `${SCRATCH}/s3-map.png` });

// ③ glide to glyph tier (seals, POI freeze), hold
await glide(0.55, 0.18, 1500);
await page.waitForTimeout(1500);
console.log('tier@0.18:', await tier());
await page.screenshot({ path: `${SCRATCH}/s3-glyph.png` });

// ④ tail hold
await page.waitForTimeout(1000);
const tEnd = Date.now();

const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

// trim to choreography (small lead-in margin), transcode
const offset = Math.max(0, (tStart - tPageOpen) / 1000 - 0.25);
const dur = (tEnd - tStart) / 1000 + 0.25;
console.log(`raw=${webm} offset=${offset.toFixed(2)}s dur=${dur.toFixed(2)}s`);
execSync(`${FFMPEG} -y -i "${webm}" -ss ${offset.toFixed(2)} -t ${dur.toFixed(2)} -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 -an "${OUT}"`, { stdio: 'inherit' });
const probe = execSync(`${FFPROBE} -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "${OUT}"`).toString();
console.log(probe);
const seconds = parseFloat(probe.match(/duration=([\d.]+)/)?.[1] ?? '0');
if (seconds < 6) { console.error(`FAIL: scene3.mp4 only ${seconds}s (<6s)`); process.exit(1); }
console.log(`OK: scene3.mp4 ${seconds.toFixed(2)}s`);
