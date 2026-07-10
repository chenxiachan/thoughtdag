import type { ThoughtNode, ThoughtEdge } from '../types';
import { COLORS } from './constants';

// The seeded example canvas: three framed chapters that demonstrate every
// element — the conversation chain + branches + reviewer, materials +
// dashed references, the staleness/replay/version loop, and the ⚖️
// context-pruning pair (the core pitch). Loaded for brand-new users and
// via the landing "Load example" button.

type Lang = 'en' | 'zh';

interface SeedNode {
  id: string;
  q: string;
  a: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  extra?: Record<string, unknown>;
}

const CONTENT: Record<Lang, { nodes: SeedNode[] }> = {
  en: {
    nodes: [
      {
        id: 'welcome',
        q: '👋 Welcome to ThoughtDAG: read me first',
        a: 'This canvas is a **conversation you can edit**. One rule powers everything: **a wire IS context**. Whatever connects into a node is what the model sees there.\n\n**The edges:**\n- **Purple solid** = the conversation chain (full history flows; layout and paradigms follow it)\n- **Orange solid** = a branch grown from selected text (structural too, just a different lineage)\n- **Purple dashed** = a *reference*: quotes that node\'s Q&A + a trail of its upstream questions; select the edge to see its token price and switch quote ⇄ full\n- **Red dashed** = a reviewer watching a thread\n\n**The marks:** an **amber badge** means "upstream changed since this answer". Click it to re-run in place (a new version is appended, old ones kept). The toolbar\'s amber chip replays everything stale in dependency order, with a price tag.\n\n**Gestures:** double-click empty canvas = new question node · double-click a card = reading panel · drag a wire to empty space = continue from there · drop a wire on a card = reference it.\n\nEach framed region below is a chapter. Delete anything, drag anything. Press `?` for the tutorial. This graph is yours now.',
        x: 40, y: -640,
      },
      // ── ① the conversation chain ──
      {
        id: 'root',
        q: 'Why do diffusion models beat GANs at image synthesis?',
        a: 'Three factors dominate:\n\n1. **Mode coverage**: likelihood-based training avoids mode collapse\n2. **Stable optimization**: no adversarial minimax game\n3. **Scalable conditioning**: classifier-free guidance composes cleanly\n\nThe cost: sampling is slow, since generation walks back through hundreds of denoising steps.',
        x: 40, y: 330, extra: { isRoot: true },
      },
      {
        id: 'chain1',
        q: 'Then why is sampling slow, and what fixes it?',
        a: 'The reverse process needs hundreds of small denoising steps. Modern fixes:\n\n1. **DDIM**: deterministic sampling, ~50 steps\n2. **Progressive distillation**: a student learns to jump\n3. **Consistency models**: 1–4 steps, near-realtime',
        x: 40, y: 640, extra: { highlights: [{ id: 'h-ex-1', text: 'Consistency models' }] },
      },
      {
        id: 'branch1',
        q: 'How do consistency models reach one-step generation?',
        a: 'They learn a map from **any point on the ODE trajectory straight to its origin**, so one evaluation replaces the whole reverse walk [1][2].',
        x: 700, y: 720,
        extra: {
          isBranch: true, branchContext: 'Consistency models',
          references: [
            { title: 'Consistency Models', url: 'https://arxiv.org/abs/2303.01469', media: 'arXiv', date: '2023-03' },
            { title: 'Latent Consistency Models', url: 'https://arxiv.org/abs/2310.04378', media: 'arXiv', date: '2023-10' },
          ],
        },
      },
      {
        id: 'evaluator',
        q: '[Reviewer] Critique the discussion above: identify overclaims, missing evidence, and unstated assumptions. Be concise.',
        a: '**Critique:** the one-step "parity" claim is overstated: quality still trails multi-step samplers at high resolution. Cite quantitative FID gaps rather than asserting parity.\n\n*Try asking me a follow-up. I\'m an ordinary node. The red edge slides forward as your thread grows, and I re-critique each new step on my own.*',
        x: 700, y: 1120,
        extra: {
          isEvaluator: true, autoRerun: true,
          rolePrompt: 'You are a rigorous peer reviewer. Critique the reasoning above: identify overclaims, missing evidence, and unstated assumptions.',
          summary: 'One-step parity is overstated; demand FID evidence at high resolution.',
        },
      },
      // ── ② materials & references ──
      {
        id: 'note',
        q: '# Research note\nPain point in interactive scientific plotting: every parameter tweak waits for a render. If generation dropped under ~100 ms, parameter sweeps could become slider drags.\n\n*(I am a NOTE, canvas material. I only enter context through my outgoing wire. Unwired material is decoration, and says so.)*',
        a: '', x: 1450, y: 60, w: 460,
        extra: { stepKind: 'note' },
      },
      {
        id: 'ask',
        q: 'Combining the research chain\'s conclusion with this note: what would one-step generation mean for interactive scientific plotting?',
        a: 'It collapses the render-wait loop the note describes: with consistency-model latency (1–4 steps), a parameter sweep becomes a **live slider**. Each drag re-renders at interactive rates instead of queueing a job.\n\n*Look at my two incoming wires: a **solid** one from the note (material) and a **purple dashed** one from the chain on the left, a REFERENCE. It quotes that node\'s Q&A plus a one-line trail of its upstream questions, without dragging the whole conversation in. Select the dashed edge: a chip shows its token price and flips quote ⇄ full.*',
        x: 1450, y: 500,
      },
      {
        id: 'stale-demo',
        q: 'Condense everything above into a one-line takeaway',
        a: '**Takeaway: consistency-model one-step generation brings diffusion-grade quality into the interactive loop. Scientific plotting tools can render while you drag.**\n\n*This node demonstrates two things.*\n\n*① The amber **"Upstream changed"** badge in my header: my upstream was edited after this answer was written, so my answer may no longer follow from what\'s above. Click the badge to re-run me in place, or use the amber **Replay stale** chip in the toolbar to fix the whole canvas in dependency order (it asks first, with a token estimate).*\n\n*② The **v2/2 pager** under my answer: every re-run appends a VERSION (old ones kept for comparison; switch back and watch downstream badges react). Versions are alternate answers to the same question; a BRANCH (⋯ menu → "Regenerate as branch") is a parallel node that can grow its own downstream.*',
        x: 1450, y: 1000,
        extra: {
          responses: ['One-step generation makes diffusion fast enough for interaction.', '**Takeaway: consistency-model one-step generation brings diffusion-grade quality into the interactive loop. Scientific plotting tools can render while you drag.**\n\n*This node demonstrates two things.*\n\n*① The amber **"Upstream changed"** badge in my header: my upstream was edited after this answer was written, so my answer may no longer follow from what\'s above. Click the badge to re-run me in place, or use the amber **Replay stale** chip in the toolbar to fix the whole canvas in dependency order (it asks first, with a token estimate).*\n\n*② The **v2/2 pager** under my answer: every re-run appends a VERSION (old ones kept for comparison; switch back and watch downstream badges react). Versions are alternate answers to the same question; a BRANCH (⋯ menu → "Regenerate as branch") is a parallel node that can grow its own downstream.*'],
          responseIndex: 1,
          lastContextHash: 'demo-stale',
          lastGeneratedAt: '2026-07-09T09:00:00.000Z',
        },
      },
      // ── ③ the ⚖️ pruning pair ──
      {
        id: 'noise',
        q: 'Unrelated: what should I cook tonight?',
        a: 'How about a quick mushroom risotto? Arborio rice, stock, parmesan, 30 minutes.\n\n*(This node exists to pollute the context of the ⚖️ demo below. In a linear chat you could never remove it.)*',
        x: 2210, y: 60,
      },
      {
        id: 'cmp-full',
        q: '⚖️ Same question A: summarize what we know (WITH the cooking noise in context)',
        a: 'Here\'s a summary of our discussion:\n\nWe covered diffusion models beating GANs (mode coverage, stable training), slow sampling and its fixes (DDIM, distillation, consistency models), **and also dinner plans: mushroom risotto with arborio rice**.\n\n*Notice how the noise leaks in and dilutes the technical summary. The model can\'t tell what matters: everything upstream is "context".*',
        x: 2210, y: 460,
      },
      {
        id: 'cmp-pruned',
        q: '⚖️ Same question B: summarize what we know (noise edge DELETED)',
        a: 'Here\'s a summary of our discussion:\n\n**Diffusion vs GANs:** likelihood training wins on mode coverage and stability. **The sampling bottleneck:** hundreds of reverse steps, addressed by DDIM (~50 steps), progressive distillation, and consistency models (1–4 steps).\n\n*Same question, but this node\'s incoming edge skips the cooking node. Compare with node A: this is what "you control the context" means. The **will-send preview** above the ask box shows exactly what flows in, layer by layer (materials · references · conversation), before you spend a token.*',
        x: 2210, y: 920,
      },
      // ── frames: the chapters ──
      { id: 'frame-chain', q: '① The conversation: chain · branch · reviewer', a: '', x: 0, y: 240, w: 1290, h: 1300, extra: { stepKind: 'frame', frameColor: 'violet' } },
      { id: 'frame-material', q: '② Material & references: wires decide what enters', a: '', x: 1400, y: 0, w: 640, h: 1560, extra: { stepKind: 'frame', frameColor: 'amber' } },
      { id: 'frame-prune', q: '③ ⚖️ Prune the context, change the answer', a: '', x: 2160, y: 0, w: 640, h: 1440, extra: { stepKind: 'frame', frameColor: 'sky' } },
    ],
  },
  zh: {
    nodes: [
      {
        id: 'welcome',
        q: '👋 欢迎来到 ThoughtDAG：先读我',
        a: '这张画布是一段**可以编辑的对话**。一条规则贯穿一切：**连线即上下文**。连进一个节点的东西，就是模型在那里看到的东西。\n\n**边的语言：**\n- **紫色实线** = 对话主链（完整历史流入；排版和范式沿它推进）\n- **橙色实线** = 从选中文字长出的探索分支（同样是结构边，只是另一条脉络）\n- **紫色虚线** = **引用**：把那个节点的问答+它上游问题的来路带进来，不拖整条对话。选中这条边能看到 token 价签，可切换 引用 ⇄ 全量\n- **红色虚线** = 盯着一条讨论线的评审\n\n**标记：**琥珀色**「上游已变」徽章** = 这个回答写成之后上游被改过。点徽章原地重放（追加新版本，旧版保留）；工具栏的琥珀 chip 可按依赖顺序**批量重放**全部陈旧节点（先确认、带 token 报价）。\n\n**手势：**双击空白=新提问节点 · 双击卡片=阅读面板 · 拖线到空白=就地延续 · 拖线落在卡片上=引用它。\n\n下面每个虚线分区是一章。随便删、随便拖，`?` 打开教程，右上角 JSON 图标可导出运行 manifest。这张图现在是你的了。',
        x: 40, y: -640,
      },
      // ── ① 对话主链 ──
      {
        id: 'root',
        q: '为什么扩散模型在图像生成上胜过 GAN？',
        a: '三个决定性因素：\n\n1. **模式覆盖**：基于似然的训练避免了模式崩塌\n2. **训练稳定**：没有对抗式极小极大博弈\n3. **可扩展的条件控制**：classifier-free guidance 组合性好\n\n代价：采样慢，生成要走几百步去噪。',
        x: 40, y: 330, extra: { isRoot: true },
      },
      {
        id: 'chain1',
        q: '那为什么采样慢？有什么解决办法？',
        a: '反向过程需要几百个小步去噪。现代方案：\n\n1. **DDIM**：确定性采样，约 50 步\n2. **渐进蒸馏**：学生模型学会跳步\n3. **一致性模型**：1–4 步，接近实时',
        x: 40, y: 640, extra: { highlights: [{ id: 'h-ex-1', text: '一致性模型' }] },
      },
      {
        id: 'branch1',
        q: '一致性模型怎么做到一步生成的？',
        a: '它学习一个从 **ODE 轨迹上任意点直接映射回原点**的函数，一次求值就替代了整个反向过程 [1][2]。',
        x: 700, y: 720,
        extra: {
          isBranch: true, branchContext: '一致性模型',
          references: [
            { title: 'Consistency Models', url: 'https://arxiv.org/abs/2303.01469', media: 'arXiv', date: '2023-03' },
            { title: 'Latent Consistency Models', url: 'https://arxiv.org/abs/2310.04378', media: 'arXiv', date: '2023-10' },
          ],
        },
      },
      {
        id: 'evaluator',
        q: '[审稿人] 批评上面的讨论：指出夸大之处、缺失的证据和未言明的假设。保持简洁。',
        a: '**批评：**「一步生成达到同等质量」的说法言过其实：高分辨率下质量仍落后于多步采样器。应引用具体的 FID 差距数据，而不是断言持平。\n\n*试着追问我。我就是个普通节点。红色的边会随讨论延伸自动前移，每一步新内容我都会自己重新评审。*',
        x: 700, y: 1120,
        extra: {
          isEvaluator: true, autoRerun: true,
          rolePrompt: '你是一位严格的论文审稿人。批评上文的推理：指出夸大之处、缺失的证据和未言明的假设。',
          summary: '一步生成持平的说法夸大；要求高分辨率 FID 证据。',
        },
      },
      // ── ② 材料与引用 ──
      {
        id: 'note',
        q: '# 研究便签\n交互式科研绘图的痛点：每次调参都要等渲染。如果生成能压到 ~100ms 以内，参数扫描就能变成拖滑块。\n\n*（我是一张便签，画布材料。只有我的出边连到哪里，我才进入哪里的上下文。没连线的材料只是装饰，卡片上会明说。）*',
        a: '', x: 1450, y: 60, w: 460,
        extra: { stepKind: 'note' },
      },
      {
        id: 'ask',
        q: '结合左边研究链的结论和这张便签：一步生成对交互式科研绘图意味着什么？',
        a: '它直接消掉了便签里说的「调参-等渲染」循环：一致性模型的延迟（1–4 步）让参数扫描变成**实时滑块**。每次拖动都即时重渲染，而不是排队等任务。\n\n*看我的两条入边：便签过来的**实线**（材料），和左边主链过来的**紫色虚线**。那是一条**引用**：只带那个节点的问答+一行上游问题的来路，不把整条对话拖进来。选中那条虚线试试：有个小 chip 显示它的 token 价格，点击可在 引用 ⇄ 全量 之间切换。*',
        x: 1450, y: 500,
      },
      {
        id: 'stale-demo',
        q: '把上面的一切浓缩成一句 takeaway',
        a: '**Takeaway：一致性模型的一步生成把扩散级画质带进了交互循环，科研绘图工具可以边拖边渲染。**\n\n*这个节点演示两件事。*\n\n*① 我头部琥珀色的**「上游已变」徽章**：这个回答写成之后，上游被改过，所以我的回答可能已经接不上上文了。点徽章原地重放我；或者用顶部工具栏的琥珀色**「重放陈旧」**chip，按依赖顺序修复整张画布（会先确认，带 token 报价）。*\n\n*② 回答下方的 **v2/2 翻页**：每次重放都会**追加一个版本**（旧版保留可对比。切回旧版试试，下游的徽章会跟着反应）。版本=同一问题的备选回答；分支（⋯ 菜单 →「另开分支重答」）才是能各自发展下游的平行探索。*',
        x: 1450, y: 1000,
        extra: {
          responses: ['一步生成让扩散模型快到可以交互了。', '**Takeaway：一致性模型的一步生成把扩散级画质带进了交互循环，科研绘图工具可以边拖边渲染。**\n\n*这个节点演示两件事。*\n\n*① 我头部琥珀色的**「上游已变」徽章**：这个回答写成之后，上游被改过，所以我的回答可能已经接不上上文了。点徽章原地重放我；或者用顶部工具栏的琥珀色**「重放陈旧」**chip，按依赖顺序修复整张画布（会先确认，带 token 报价）。*\n\n*② 回答下方的 **v2/2 翻页**：每次重放都会**追加一个版本**（旧版保留可对比。切回旧版试试，下游的徽章会跟着反应）。版本=同一问题的备选回答；分支（⋯ 菜单 →「另开分支重答」）才是能各自发展下游的平行探索。*'],
          responseIndex: 1,
          lastContextHash: 'demo-stale',
          lastGeneratedAt: '2026-07-09T09:00:00.000Z',
        },
      },
      // ── ③ ⚖️ 修剪对比 ──
      {
        id: 'noise',
        q: '无关插曲：今晚吃什么好？',
        a: '来个快手蘑菇烩饭怎么样？Arborio 米、高汤、帕玛森芝士，30 分钟搞定。\n\n*（这个节点专门用来污染右侧 ⚖️ 演示的上下文。在线性聊天里，你永远删不掉它。）*',
        x: 2210, y: 60,
      },
      {
        id: 'cmp-full',
        q: '⚖️ 同一问题 A：总结我们聊了什么（上下文里**带着**做饭闲聊）',
        a: '以下是我们讨论的总结：\n\n我们讨论了扩散模型胜过 GAN 的原因（模式覆盖、训练稳定）、采样慢的问题及解决方案（DDIM、蒸馏、一致性模型），**还有晚饭计划：用 Arborio 米做蘑菇烩饭**。\n\n*注意闲聊如何漏进来稀释了技术总结。模型分不清什么重要：上游的一切都是「上下文」。*',
        x: 2210, y: 460,
      },
      {
        id: 'cmp-pruned',
        q: '⚖️ 同一问题 B：总结我们聊了什么（做饭那条边**已删除**）',
        a: '以下是我们讨论的总结：\n\n**扩散 vs GAN：**似然训练在模式覆盖和稳定性上胜出。**采样瓶颈：**几百步反向过程，由 DDIM（约 50 步）、渐进蒸馏、一致性模型（1–4 步）逐级解决。\n\n*同一个问题，但这个节点的入边跳过了做饭节点。对比 A 节点：这就是「你控制上下文」的含义。追问框上方的**「将发送」预览**会按 材料 · 引用 · 对话 三层展示到底有什么会流入。花 token 之前先看账单。*',
        x: 2210, y: 920,
      },
      // ── 分区框：章节 ──
      { id: 'frame-chain', q: '① 对话：主链 · 分支 · 评审', a: '', x: 0, y: 240, w: 1290, h: 1300, extra: { stepKind: 'frame', frameColor: 'violet' } },
      { id: 'frame-material', q: '② 材料与引用：连线决定什么进入', a: '', x: 1400, y: 0, w: 640, h: 1560, extra: { stepKind: 'frame', frameColor: 'amber' } },
      { id: 'frame-prune', q: '③ ⚖️ 修剪上下文，改变回答', a: '', x: 2160, y: 0, w: 640, h: 1440, extra: { stepKind: 'frame', frameColor: 'sky' } },
    ],
  },
};

export function buildExampleGraph(lang: Lang): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const { nodes: seeds } = CONTENT[lang] ?? CONTENT.en;

  const nodes: ThoughtNode[] = seeds.map(({ id, q, a, x, y, w, h, extra }) => ({
    id: `ex-${id}`,
    type: 'thought',
    position: { x, y },
    ...(w ? { width: w } : {}),
    ...(h ? { height: h } : {}),
    ...(extra?.stepKind === 'frame' ? { zIndex: -1 } : {}),
    dragHandle: '.drag-handle',
    data: {
      question: q,
      response: a,
      responses: a ? [a] : [],
      responseIndex: a ? 0 : -1,
      isCollapsed: false,
      isEditing: false,
      isEditingResponse: false,
      isLoading: false,
      tokenCount: Math.ceil((q + a).length / 4),
      highlights: [],
      highlightMode: 'tag',
      attachments: [],
      excludedAttachmentIds: [],
      includedAttachmentIds: [],
      roleMode: 'inherit',
      isRoot: false,
      isBranch: false,
      ...extra,
    },
  })) as ThoughtNode[];

  const E = (source: string, target: string, opts: { branch?: boolean; watch?: boolean; ref?: boolean } = {}): ThoughtEdge => ({
    id: `ex-e-${source}-${target}`,
    source: `ex-${source}`,
    target: `ex-${target}`,
    type: 'smoothstep',
    sourceHandle: opts.branch || opts.ref ? 'branch' : 'continue',
    targetHandle: opts.branch || opts.watch || opts.ref ? 'left' : 'top',
    animated: !!(opts.branch || opts.watch || opts.ref),
    style: opts.watch
      ? { stroke: COLORS.watch, strokeWidth: 2, strokeDasharray: '4 4' }
      : opts.branch
        ? { stroke: COLORS.warm, strokeWidth: 2 }
        : opts.ref
          ? { stroke: COLORS.accent, strokeWidth: 2, strokeDasharray: '8 4' }
          : { stroke: COLORS.accent, strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: opts.watch ? COLORS.watch : opts.branch ? COLORS.warm : COLORS.accent, width: 18, height: 18 } as ThoughtEdge['markerEnd'],
    data: opts.watch
      ? { isCrossLink: true, isWatch: true }
      : opts.ref
        ? { isCrossLink: true }
        : opts.branch
          ? { isBranchFromSelection: true }
          : {},
  });

  const edges: ThoughtEdge[] = [
    // ① the chain
    E('root', 'chain1'),
    E('chain1', 'branch1', { branch: true }),
    E('branch1', 'evaluator', { watch: true }),
    // ② materials & references: solid material wire + dashed reference
    E('note', 'ask'),
    E('branch1', 'ask', { ref: true }),
    E('ask', 'stale-demo'),
    // ③ the ⚖️ demo pair: A inherits the noise, B skips it
    E('root', 'noise'),
    E('noise', 'cmp-full'),
    E('chain1', 'cmp-full', { branch: true }),
    E('chain1', 'cmp-pruned', { branch: true }),
  ];

  return { nodes, edges };
}
