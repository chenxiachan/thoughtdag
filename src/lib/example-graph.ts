import type { ThoughtNode, ThoughtEdge } from '../types';

// The seeded example canvas: shows every edge type, and — the core pitch —
// a side-by-side pair proving that pruning context changes the answer.
// Loaded for brand-new users and via the landing "Load example" button.

type Lang = 'en' | 'zh';

interface SeedNode {
  id: string;
  q: string;
  a: string;
  x: number;
  y: number;
  extra?: Record<string, unknown>;
}

const CONTENT: Record<Lang, { nodes: SeedNode[] }> = {
  en: {
    nodes: [
      {
        id: 'welcome',
        q: '👋 Welcome to ThoughtDAG — read me first',
        a: 'This canvas is a **conversation you can edit** — built from a few small blocks that combine into everything else:\n\n- **Node** = one Q&A · **Arrow** = context flow (whatever wires in, the model sees)\n- **Purple** = follow-up chain · **Orange** = a branch grown from selected text · **Red dashed** = an edge that slides forward as its thread grows\n- **🔁 Auto-refresh (Live)**: any node can regenerate whenever upstream changes. The reviewer below-right is just an ordinary node + critic role + this switch — so you can question its critique or branch from it like any node\n- **Loops**: wire a critic BACK to a writer and raise the rounds (×3) — one click iterates draft → critique → revise until the budget runs out. See the pair at the bottom and flip through their version history (‹ › in the header)\n\n⚖️ **Don\'t miss the pair on the right** — same question, different context, different answer.\n\nDelete anything, drag anything, press `?` for the tutorial. This graph is yours now.',
        x: 40, y: 30,
      },
      {
        id: 'root',
        q: 'Why do diffusion models beat GANs at image synthesis?',
        a: 'Three factors dominate:\n\n1. **Mode coverage** — likelihood-based training avoids mode collapse\n2. **Stable optimization** — no adversarial minimax game\n3. **Scalable conditioning** — classifier-free guidance composes cleanly\n\nThe cost: sampling is slow, since generation walks back through hundreds of denoising steps.',
        x: 40, y: 330, extra: { isRoot: true },
      },
      {
        id: 'chain1',
        q: 'Then why is sampling slow, and what fixes it?',
        a: 'The reverse process needs hundreds of small denoising steps. Modern fixes:\n\n1. **DDIM** — deterministic sampling, ~50 steps\n2. **Progressive distillation** — a student learns to jump\n3. **Consistency models** — 1–4 steps, near-realtime',
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
        a: '**Critique:** the one-step "parity" claim is overstated — quality still trails multi-step samplers at high resolution. Cite quantitative FID gaps rather than asserting parity.\n\n*Try asking me a follow-up — I\'m an ordinary node. The red edge slides forward as the thread grows, and Auto-refresh makes me re-critique each new step.*',
        x: 1360, y: 1060,
        extra: {
          isEvaluator: true, autoRerun: true,
          rolePrompt: 'You are a rigorous peer reviewer. Critique the reasoning above: identify overclaims, missing evidence, and unstated assumptions.',
          summary: 'One-step parity is overstated; demand FID evidence at high resolution.',
        },
      },
      {
        id: 'noise',
        q: 'Unrelated: what should I cook tonight?',
        a: 'How about a quick mushroom risotto? Arborio rice, stock, parmesan — 30 minutes.\n\n*(This node exists to pollute the context of the ⚖️ demo below. In a linear chat you could never remove it.)*',
        x: 700, y: 330,
      },
      {
        id: 'cmp-full',
        q: '⚖️ Same question A: summarize what we know (WITH the cooking noise in context)',
        a: 'Here\'s a summary of our discussion:\n\nWe covered diffusion models beating GANs (mode coverage, stable training), slow sampling and its fixes (DDIM, distillation, consistency models), **and also dinner plans — mushroom risotto with arborio rice**.\n\n*Notice how the noise leaks in and dilutes the technical summary. The model can\'t tell what matters — everything upstream is "context".*',
        x: 1360, y: 30,
      },
      {
        id: 'cmp-pruned',
        q: '⚖️ Same question B: summarize what we know (noise edge DELETED)',
        a: 'Here\'s a summary of our discussion:\n\n**Diffusion vs GANs:** likelihood training wins on mode coverage and stability. **The sampling bottleneck:** hundreds of reverse steps, addressed by DDIM (~50 steps), progressive distillation, and consistency models (1–4 steps) — the current frontier for near-realtime generation.\n\n*Same question — but this node\'s incoming edge skips the cooking node. Compare with node A: this is what "you control the context" means. Try it: delete or re-draw any edge and regenerate.*',
        x: 1360, y: 540,
      },
      {
        id: 'loop-writer',
        q: '\u270d\ufe0f Draft a one-sentence definition of "context engineering". Improve it using any critique visible above.',
        a: 'Context engineering is the practice of deciding exactly what an LLM sees before it answers \u2014 selecting, pruning, and structuring the input so the model reasons from signal, not noise.',
        x: 40, y: 1010,
        extra: {
          autoRerun: true, autoRerunRounds: 3, roleMode: 'reset',
          rolePrompt: 'You are a precise technical writer. Revise your definition using any critique available; keep it to one sentence.',
          responses: [
            'Context engineering is about giving the AI good prompts.',
            'Context engineering means curating the information an LLM receives so its answers improve.',
            'Context engineering is the practice of deciding exactly what an LLM sees before it answers \u2014 selecting, pruning, and structuring the input so the model reasons from signal, not noise.',
          ],
          responseIndex: 2,
          summary: 'A writer node in a \u00d73 loop \u2014 flip versions (\u2039 \u203a) to watch the definition sharpen.',
        },
      },
      {
        id: 'loop-critic',
        q: '\ud83d\udd0d Critique the definition above sharply \u2014 one short paragraph.',
        a: 'v3 finally earns the word "engineering": it names concrete operations (select, prune, structure) and a purpose (signal over noise). Remaining nit: it ignores ordering effects. Good enough to ship.',
        x: 700, y: 1010,
        extra: {
          autoRerun: true, autoRerunRounds: 3, roleMode: 'reset',
          rolePrompt: 'You are a blunt critic. Find the weakest word in the definition and attack it.',
          responses: [
            '"Good prompts" is hand-waving \u2014 what operations? What goal? This defines nothing.',
            'Better, but "curating" is vague and "improve" is circular. Name the actual verbs.',
            'v3 finally earns the word "engineering": it names concrete operations (select, prune, structure) and a purpose (signal over noise). Remaining nit: it ignores ordering effects. Good enough to ship.',
          ],
          responseIndex: 2,
          summary: 'The critic that drove those revisions \u2014 wired BACK to the writer to close the loop.',
        },
      },
    ],
  },
  zh: {
    nodes: [
      {
        id: 'welcome',
        q: '👋 欢迎来到 ThoughtDAG —— 先读我',
        a: '这张画布是一段**可以编辑的对话**——整个产品只是几个积木，组合出其余一切：\n\n- **节点** = 一轮问答 · **箭头** = 上下文流向（连进来的，模型就看得见）\n- **紫色** = 追问主链 · **橙色** = 从选中文字长出的分支 · **红色虚线** = 随思路延伸自动前移的跟随边\n- **🔁 自动刷新（实时）**：任何节点都能开——上游一变它就重新生成。右下角的审稿人就是「普通节点 + 批评角色 + 这个开关」，所以你可以反问它的批评、从它分支，像对任何节点一样\n- **循环**：把批评者**连回**写作者、调高轮数（×3）——点一次就自动「起草→批评→修订」直到预算用尽。看最下方那对节点，用标题栏的 ‹ › 翻它们的版本历史\n\n⚖️ **别错过右侧那对节点**——同一个问题、不同上下文、不同回答。\n\n随便删、随便拖，`?` 有教程。这张图现在是你的了。',
        x: 40, y: 30,
      },
      {
        id: 'root',
        q: '为什么扩散模型在图像生成上胜过 GAN？',
        a: '三个决定性因素：\n\n1. **模式覆盖** —— 基于似然的训练避免了模式崩塌\n2. **训练稳定** —— 没有对抗式极小极大博弈\n3. **可扩展的条件控制** —— classifier-free guidance 组合性好\n\n代价：采样慢，生成要走几百步去噪。',
        x: 40, y: 330, extra: { isRoot: true },
      },
      {
        id: 'chain1',
        q: '那为什么采样慢？有什么解决办法？',
        a: '反向过程需要几百个小步去噪。现代方案：\n\n1. **DDIM** —— 确定性采样，约 50 步\n2. **渐进蒸馏** —— 学生模型学会跳步\n3. **一致性模型** —— 1–4 步，接近实时',
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
        a: '**批评：**「一步生成达到同等质量」的说法言过其实——高分辨率下质量仍落后于多步采样器。应引用具体的 FID 差距数据，而不是断言持平。\n\n*试着追问我——我就是个普通节点。红色跟随边会随讨论延伸自动前移，自动刷新让我对每一步新内容重新评审。*',
        x: 1360, y: 1060,
        extra: {
          isEvaluator: true, autoRerun: true,
          rolePrompt: '你是一位严格的论文审稿人。批评上文的推理：指出夸大之处、缺失的证据和未言明的假设。',
          summary: '一步生成持平的说法夸大；要求高分辨率 FID 证据。',
        },
      },
      {
        id: 'noise',
        q: '无关插曲：今晚吃什么好？',
        a: '来个快手蘑菇烩饭怎么样？Arborio 米、高汤、帕玛森芝士，30 分钟搞定。\n\n*（这个节点专门用来污染右侧 ⚖️ 演示的上下文。在线性聊天里，你永远删不掉它。）*',
        x: 700, y: 330,
      },
      {
        id: 'cmp-full',
        q: '⚖️ 同一问题 A：总结我们聊了什么（上下文里**带着**做饭闲聊）',
        a: '以下是我们讨论的总结：\n\n我们讨论了扩散模型胜过 GAN 的原因（模式覆盖、训练稳定）、采样慢的问题及解决方案（DDIM、蒸馏、一致性模型），**还有晚饭计划——用 Arborio 米做蘑菇烩饭**。\n\n*注意闲聊如何漏进来稀释了技术总结。模型分不清什么重要——上游的一切都是「上下文」。*',
        x: 1360, y: 30,
      },
      {
        id: 'cmp-pruned',
        q: '⚖️ 同一问题 B：总结我们聊了什么（做饭那条边**已删除**）',
        a: '以下是我们讨论的总结：\n\n**扩散 vs GAN：**似然训练在模式覆盖和稳定性上胜出。**采样瓶颈：**几百步反向过程，由 DDIM（约 50 步）、渐进蒸馏、一致性模型（1–4 步）逐级解决——后者是接近实时生成的当前前沿。\n\n*同一个问题——但这个节点的入边跳过了做饭节点。对比 A 节点：这就是「你控制上下文」的含义。试试看：删掉或重连任何一条边，然后重新生成。*',
        x: 1360, y: 540,
      },
      {
        id: 'loop-writer',
        q: '\u270d\ufe0f 起草「上下文工程」的一句话定义。利用上方可见的任何批评改进它。',
        a: '上下文工程是在模型作答之前，精确决定它能看到什么的实践——通过选择、裁剪与结构化输入，让模型基于信号而非噪音推理。',
        x: 40, y: 1010,
        extra: {
          autoRerun: true, autoRerunRounds: 3, roleMode: 'reset',
          rolePrompt: '你是一位严谨的技术作者。利用可见的批评修订你的定义；保持一句话。',
          responses: [
            '上下文工程就是给 AI 写好的提示词。',
            '上下文工程是指整理 LLM 接收的信息，让它的回答更好。',
            '上下文工程是在模型作答之前，精确决定它能看到什么的实践——通过选择、裁剪与结构化输入，让模型基于信号而非噪音推理。',
          ],
          responseIndex: 2,
          summary: '一个 \u00d73 循环里的写作节点——用标题栏 \u2039 \u203a 翻版本，看定义如何一轮轮变锋利。',
        },
      },
      {
        id: 'loop-critic',
        q: '\ud83d\udd0d 尖锐地批评上面的定义——一小段即可。',
        a: 'v3 终于配得上「工程」二字：说出了具体操作（选择、裁剪、结构化）和目的（信号胜于噪音）。剩余小瑕疵：忽略了顺序效应。可以定稿了。',
        x: 700, y: 1010,
        extra: {
          autoRerun: true, autoRerunRounds: 3, roleMode: 'reset',
          rolePrompt: '你是一位直言不讳的批评者。找出定义里最弱的词并攻击它。',
          responses: [
            '「好的提示词」是含糊其辞——什么操作？什么目标？这等于什么都没定义。',
            '好一些了，但「整理」依然模糊，「更好」是循环论证。说出真正的动词。',
            'v3 终于配得上「工程」二字：说出了具体操作（选择、裁剪、结构化）和目的（信号胜于噪音）。剩余小瑕疵：忽略了顺序效应。可以定稿了。',
          ],
          responseIndex: 2,
          summary: '驱动那些修订的批评者——被连回写作者，闭合了循环。',
        },
      },
    ],
  },
};

export function buildExampleGraph(lang: Lang): { nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const { nodes: seeds } = CONTENT[lang] ?? CONTENT.en;

  const nodes: ThoughtNode[] = seeds.map(({ id, q, a, x, y, extra }) => ({
    id: `ex-${id}`,
    type: 'thought',
    position: { x, y },
    dragHandle: '.drag-handle',
    data: {
      question: q,
      response: a,
      responses: [a],
      responseIndex: 0,
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

  const E = (source: string, target: string, opts: { branch?: boolean; watch?: boolean } = {}): ThoughtEdge => ({
    id: `ex-e-${source}-${target}`,
    source: `ex-${source}`,
    target: `ex-${target}`,
    type: 'smoothstep',
    sourceHandle: opts.branch ? 'branch' : 'continue',
    targetHandle: opts.branch || opts.watch ? 'left' : 'top',
    animated: !!(opts.branch || opts.watch),
    style: opts.watch
      ? { stroke: '#DC2626', strokeWidth: 2, strokeDasharray: '4 4' }
      : opts.branch
        ? { stroke: '#E08A3C', strokeWidth: 2, strokeDasharray: '6 3' }
        : { stroke: '#6B5CE7', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: opts.watch ? '#DC2626' : opts.branch ? '#E08A3C' : '#6B5CE7', width: 18, height: 18 } as ThoughtEdge['markerEnd'],
    data: opts.watch ? { isCrossLink: true, isWatch: true } : opts.branch ? { isBranchFromSelection: true } : {},
  });

  const loopEdge = (source: string, target: string): ThoughtEdge => ({
    id: `ex-e-${source}-${target}`,
    source: `ex-${source}`,
    target: `ex-${target}`,
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#6B5CE7', strokeWidth: 2, strokeDasharray: '8 4' },
    markerEnd: { type: 'arrowclosed', color: '#6B5CE7', width: 18, height: 18 } as ThoughtEdge['markerEnd'],
    data: { isCrossLink: true },
  });

  const edges: ThoughtEdge[] = [
    E('root', 'chain1'),
    E('chain1', 'branch1', { branch: true }),
    E('branch1', 'evaluator', { watch: true }),
    E('root', 'noise'),
    // ⚖️ the demo pair: A inherits the noise, B skips it
    E('noise', 'cmp-full'),
    E('chain1', 'cmp-full', { branch: true }),
    E('chain1', 'cmp-pruned', { branch: true }),
    // 🔁 the bounded loop: writer ⇄ critic (reverse edges are allowed)
    loopEdge('loop-writer', 'loop-critic'),
    loopEdge('loop-critic', 'loop-writer'),
  ];

  return { nodes, edges };
}
