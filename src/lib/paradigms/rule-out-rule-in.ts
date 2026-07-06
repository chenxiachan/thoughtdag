import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../../types';

// Built-in paradigm: rule-out / rule-in (differential reasoning).
// This is a PARADIGM graph (orchestration view) — steps carry prompt
// engineering, not questions. Bilingual: filled from the UI language when
// created. The flow: question → fan out candidates → review → converge.

type Lang = 'en' | 'zh';

interface Step {
  id: string;
  kind: NonNullable<ThoughtData['stepKind']>;
  title: string;
  instruction: string;
  role?: string;
  fanoutRoles?: { name: string; prompt: string }[];
  x: number;
  y: number;
}

const CONTENT: Record<Lang, { name: string; steps: Step[]; edges: [string, string][] }> = {
  en: {
    name: 'Rule-out / Rule-in',
    steps: [
      {
        id: 'q', kind: 'step', x: 80, y: 40,
        title: 'Research question',
        instruction: 'State the differential question here. On instantiation this becomes the root node — replace it with your real question, then run.',
      },
      {
        id: 'fan', kind: 'fanout', x: 80, y: 420,
        title: 'Generate candidate explanations',
        instruction: 'Answer the question above strictly through your assigned lens. One mechanism, stated so it could be tested or ruled out.',
        fanoutRoles: [
          { name: 'Mechanism A', prompt: 'You argue the phenomenon is best explained by a low-level mechanistic account. Be concrete and falsifiable.' },
          { name: 'Mechanism B', prompt: 'You argue for a higher-level / systems account. Name the mechanism and its boundary conditions.' },
          { name: 'Confound', prompt: 'You argue the effect is an artifact or confound, not the phenomenon of interest. Specify what would rule this in or out.' },
          { name: 'Null', prompt: 'You argue the effect may not be real or is overstated. State the strongest deflationary case.' },
        ],
      },
      {
        id: 'rev', kind: 'review', x: 760, y: 420,
        title: 'Differential reviewer',
        instruction: 'For each candidate above, judge what evidence would rule it OUT and what would rule it IN. Rank by discriminability: which test best separates them?',
        role: 'You are a rigorous methodologist doing differential diagnosis on competing explanations. Be specific about discriminating evidence.',
      },
      {
        id: 'syn', kind: 'synthesis', x: 80, y: 800,
        title: 'Converge',
        instruction: 'Given the surviving candidates and the reviewer\'s discriminating tests, synthesize: which explanation to rule in first, which to rule out, and the single most informative next experiment.',
      },
    ],
    edges: [['q', 'fan'], ['fan', 'rev'], ['rev', 'syn']],
  },
  zh: {
    name: '排除 / 确认（鉴别推理）',
    steps: [
      {
        id: 'q', kind: 'step', x: 80, y: 40,
        title: '研究问题',
        instruction: '在此写下要鉴别的问题。实例化后它会成为根节点——替换成你真正的问题再运行。',
      },
      {
        id: 'fan', kind: 'fanout', x: 80, y: 420,
        title: '生成候选解释',
        instruction: '严格从你被指派的视角回答上面的问题。给出一个机制，且陈述得能被检验或排除。',
        fanoutRoles: [
          { name: '机制 A', prompt: '你主张该现象最好用一个底层的机制性解释。具体、可证伪。' },
          { name: '机制 B', prompt: '你主张一个更高层 / 系统层面的解释。说清机制及其边界条件。' },
          { name: '混杂', prompt: '你主张这个效应是假象或混杂因素，而非目标现象。指出什么能确认或排除它。' },
          { name: '零假设', prompt: '你主张这个效应可能不真实或被夸大。给出最强的收缩性论证。' },
        ],
      },
      {
        id: 'rev', kind: 'review', x: 760, y: 420,
        title: '鉴别评审者',
        instruction: '对上面每个候选，判断什么证据能将它排除（rule out）、什么能将它确认（rule in）。按可区分度排序：哪个检验最能把它们分开？',
        role: '你是一位严谨的方法学家，正在对相互竞争的解释做鉴别诊断。对区分性证据要具体。',
      },
      {
        id: 'syn', kind: 'synthesis', x: 80, y: 800,
        title: '收敛',
        instruction: '综合幸存的候选与评审者的区分性检验：先确认哪个解释、排除哪个，以及信息量最大的下一个实验是什么。',
      },
    ],
    edges: [['q', 'fan'], ['fan', 'rev'], ['rev', 'syn']],
  },
};

export function buildRuleOutRuleIn(lang: Lang): { name: string; nodes: ThoughtNode[]; edges: ThoughtEdge[] } {
  const { name, steps, edges } = CONTENT[lang] ?? CONTENT.en;
  const nodes: ThoughtNode[] = steps.map((s) => ({
    id: `p-${s.id}`,
    type: 'thought',
    position: { x: s.x, y: s.y },
    dragHandle: '.drag-handle',
    data: {
      question: s.title,
      instruction: s.instruction,
      stepKind: s.kind,
      rolePrompt: s.role,
      fanoutRoles: s.fanoutRoles,
      response: '', responses: [], responseIndex: -1,
      isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
      tokenCount: 0, highlights: [], highlightMode: 'tag',
      attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
      roleMode: 'inherit', isRoot: s.id === 'q', isBranch: false,
    },
  }));
  const edgeList: ThoughtEdge[] = edges.map(([a, b]) => ({
    id: `p-e-${a}-${b}`,
    source: `p-${a}`,
    target: `p-${b}`,
    type: 'smoothstep',
    sourceHandle: 'continue',
    targetHandle: 'top',
    style: { stroke: '#6B5CE7', strokeWidth: 2 },
    markerEnd: { type: 'arrowclosed', color: '#6B5CE7', width: 18, height: 18 } as ThoughtEdge['markerEnd'],
    data: {},
  }));
  return { name, nodes, edges: edgeList };
}
