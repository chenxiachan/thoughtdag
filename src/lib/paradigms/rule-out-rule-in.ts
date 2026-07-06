import type { ThoughtNode, ThoughtEdge, ThoughtData } from '../../types';

// Built-in paradigm: rule-out / rule-in (differential reasoning).
// Two node kinds only: 'human' (the operator asks) and 'prompt' (a machine
// step processing upstream context; its persona is simply the opening lines
// of its prompt). The fan-out is drawn as graph shape — four sibling prompt
// nodes off the question — so blind isolation between candidates is
// guaranteed by the DAG itself. Bilingual: filled from the UI language.

type Lang = 'en' | 'zh';

interface Step {
  id: string;
  kind: NonNullable<ThoughtData['stepKind']>;
  title: string;
  instruction: string;
  x: number;
  y: number;
}

const CONTENT: Record<Lang, { name: string; steps: Step[]; edges: [string, string][] }> = {
  en: {
    name: 'Rule-out / Rule-in',
    steps: [
      {
        id: 'q', kind: 'human', x: 560, y: 40,
        title: 'Research question',
        instruction: 'Type the question to differentiate: what phenomenon needs explaining?',
      },
      {
        id: 'mechA', kind: 'prompt', x: 20, y: 440,
        title: 'Candidate: Mechanism A',
        instruction: 'You advocate a low-level mechanistic account of the phenomenon. Be concrete and falsifiable.\nFrom this lens, give the single best candidate explanation for the question above: name the mechanism, its testable predictions, and what evidence would rule it in or out.',
      },
      {
        id: 'mechB', kind: 'prompt', x: 500, y: 440,
        title: 'Candidate: Mechanism B',
        instruction: 'You advocate a higher-level / systems account. Name the mechanism and its boundary conditions.\nFrom this lens, give the single best candidate explanation for the question above: name the mechanism, its testable predictions, and what evidence would rule it in or out.',
      },
      {
        id: 'conf', kind: 'prompt', x: 980, y: 440,
        title: 'Candidate: Confound',
        instruction: 'You argue the effect is an artifact or confound, not the phenomenon of interest.\nFrom this lens, give the single best candidate explanation for the question above: name the suspected artifact, its testable predictions, and what evidence would rule it in or out.',
      },
      {
        id: 'null', kind: 'prompt', x: 1460, y: 440,
        title: 'Candidate: Null',
        instruction: 'You argue the effect may not be real or is overstated. State the strongest deflationary case.\nFrom this lens, give the single best candidate explanation for the question above: what would make the effect disappear, and what evidence would rule this in or out.',
      },
      {
        id: 'rev', kind: 'prompt', x: 560, y: 920,
        title: 'Differential review',
        instruction: 'You are a rigorous methodologist doing differential diagnosis on competing explanations.\nFor each candidate above, judge what evidence would rule it OUT and what would rule it IN. Rank by discriminability: which test best separates them?',
      },
      {
        id: 'syn', kind: 'prompt', x: 560, y: 1360,
        title: 'Converge',
        instruction: 'Given the candidates and the discriminating tests above, synthesize: which explanation to rule in first, which to rule out, and the single most informative next experiment.',
      },
    ],
    edges: [
      ['q', 'mechA'], ['q', 'mechB'], ['q', 'conf'], ['q', 'null'],
      ['mechA', 'rev'], ['mechB', 'rev'], ['conf', 'rev'], ['null', 'rev'],
      ['rev', 'syn'],
    ],
  },
  zh: {
    name: '排除 / 确认（鉴别推理）',
    steps: [
      {
        id: 'q', kind: 'human', x: 560, y: 40,
        title: '研究问题',
        instruction: '在这里输入要鉴别的问题：什么现象需要解释？',
      },
      {
        id: 'mechA', kind: 'prompt', x: 20, y: 440,
        title: '候选：机制 A',
        instruction: '你主张一个底层的机制性解释，具体、可证伪。\n严格从这个视角，为上面的问题给出唯一最佳的候选解释：说清机制、可检验的预测，以及什么证据能确认或排除它。',
      },
      {
        id: 'mechB', kind: 'prompt', x: 500, y: 440,
        title: '候选：机制 B',
        instruction: '你主张一个更高层 / 系统层面的解释，说清机制及其边界条件。\n严格从这个视角，为上面的问题给出唯一最佳的候选解释：说清机制、可检验的预测，以及什么证据能确认或排除它。',
      },
      {
        id: 'conf', kind: 'prompt', x: 980, y: 440,
        title: '候选：混杂',
        instruction: '你主张这个效应是假象或混杂因素，而非目标现象。\n严格从这个视角，为上面的问题给出唯一最佳的候选解释：说清疑似的混杂来源、可检验的预测，以及什么证据能确认或排除它。',
      },
      {
        id: 'null', kind: 'prompt', x: 1460, y: 440,
        title: '候选：零假设',
        instruction: '你主张这个效应可能不真实或被夸大，给出最强的收缩性论证。\n严格从这个视角回答上面的问题：什么会让效应消失，以及什么证据能确认或排除这一解释。',
      },
      {
        id: 'rev', kind: 'prompt', x: 560, y: 920,
        title: '鉴别评审',
        instruction: '你是一位严谨的方法学家，正在对相互竞争的解释做鉴别诊断。\n对上面每个候选，判断什么证据能将它排除（rule out）、什么能将它确认（rule in）。按可区分度排序：哪个检验最能把它们分开？',
      },
      {
        id: 'syn', kind: 'prompt', x: 560, y: 1360,
        title: '收敛',
        instruction: '综合上面的候选与区分性检验：先确认哪个解释、排除哪个，以及信息量最大的下一个实验是什么。',
      },
    ],
    edges: [
      ['q', 'mechA'], ['q', 'mechB'], ['q', 'conf'], ['q', 'null'],
      ['mechA', 'rev'], ['mechB', 'rev'], ['conf', 'rev'], ['null', 'rev'],
      ['rev', 'syn'],
    ],
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
