import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Globe, GraduationCap, MessageCircleQuestion, SquareTerminal, Trash2 } from 'lucide-react';
import type { ThoughtNode as ThoughtNodeType, ThoughtData } from '../types';
import { useStore } from '../store';
import { effectiveRoles } from '../lib/role-templates';
import { useUiStore } from '../lib/ui-store';
import { useI18n, useT } from '../i18n';

// Orchestration-view card. A paradigm has exactly two node kinds:
//   human  — a dialogue turn: the human asks here. The card holds optional
//            guidance for the operator; it instantiates as an EMPTY question
//            node awaiting the human.
//   prompt — a machine processing step: a fixed prompt (plus optional role)
//            applied to whatever flows in from upstream nodes.
// Flow patterns (fan-out, review, synthesis) are drawn as graph shape, not
// node kinds. No LLM ever runs in this view. Legacy v1 kinds render as
// 'prompt' but keep their stored data for instantiation.

const KINDS: { kind: 'human' | 'prompt'; icon: typeof SquareTerminal; labelKey: string }[] = [
  { kind: 'human', icon: MessageCircleQuestion, labelKey: 'paradigm.kind.human' },
  { kind: 'prompt', icon: SquareTerminal, labelKey: 'paradigm.kind.prompt' },
];

const KIND_STYLES: Record<'human' | 'prompt', string> = {
  human: 'border-warm/70',
  prompt: 'border-accent/50',
};

export default function ParadigmNode({ id, data }: NodeProps<ThoughtNodeType>) {
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const deleteNode = useStore((s) => s.deleteNode);
  const patch = (p: Partial<ThoughtData>) => {
    useStore.setState((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)),
    }));
  };
  const kind: 'human' | 'prompt' = data.stepKind === 'human' ? 'human' : 'prompt';

  return (
    <div className={`bg-card border-2 border-dashed rounded-xl w-[440px] shadow-sm ${KIND_STYLES[kind]}`}>
      <Handle type="target" position={Position.Top} id="top" className="!bg-ink-faint !w-3.5 !h-3.5 !border-2 !border-white tdag-handle" />
      {/* Invisible side anchors: watch/reference edges route through these */}
      <Handle type="target" position={Position.Left} id="left" isConnectable={false} className="!bg-transparent !w-0 !h-0 !border-0 !pointer-events-none" style={{ top: '40%' }} />
      <Handle type="source" position={Position.Right} id="branch" isConnectable={false} className="!bg-transparent !w-0 !h-0 !border-0 !pointer-events-none" style={{ top: '50%' }} />

      {/* header: drag handle + kind switcher + delete */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-line/60 cursor-grab active:cursor-grabbing drag-handle">
        <div className="flex gap-1">
          {KINDS.map(({ kind: k, icon: Icon, labelKey }) => (
            <button
              key={k}
              onClick={(e) => { e.stopPropagation(); patch({ stepKind: k }); }}
              title={t(labelKey as Parameters<typeof t>[0])}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                kind === k ? (k === 'human' ? 'bg-warm/15 text-warm' : 'bg-accent/10 text-accent') : 'text-ink-faint hover:bg-wash'
              }`}
            >
              <Icon size={14} strokeWidth={1.75} />
            </button>
          ))}
          <span className={`text-2xs self-center ml-1 uppercase tracking-wider font-medium ${kind === 'human' ? 'text-warm' : 'text-accent/80'}`}>
            {t(`paradigm.kind.${kind}` as Parameters<typeof t>[0])}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
          className="text-ink-faint hover:text-red-500 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5 nodrag">
        {/* step title */}
        <input
          type="text"
          value={data.question}
          onChange={(e) => patch({ question: e.target.value })}
          placeholder={t('paradigm.titlePlaceholder')}
          className="w-full text-sm font-semibold text-ink bg-transparent focus:outline-none placeholder-ink-faint"
        />

        {/* body: THE prompt (machine) or operator guidance (human) — one
            field; a persona is just the opening lines of the prompt */}
        <textarea
          value={data.instruction ?? ''}
          onChange={(e) => patch({ instruction: e.target.value })}
          placeholder={t(kind === 'human' ? 'paradigm.humanHintPlaceholder' : 'paradigm.promptPlaceholder')}
          rows={kind === 'human' ? 3 : 4}
          className={`w-full text-xs text-ink bg-surface border border-line rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 resize-y leading-relaxed nowheel ${
            kind === 'human' ? 'focus:ring-warm/40' : 'focus:ring-accent/40'
          }`}
        />

        {/* persona chips: prepend a template persona into the prompt */}
        {kind === 'prompt' && (
          <div className="flex flex-wrap gap-1" title={t('paradigm.insertPersona')}>
            {effectiveRoles(lang, useUiStore.getState().roleLib).map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => patch({ instruction: `${tpl.prompt}\n${data.instruction ?? ''}` })}
                className="text-2xs bg-wash hover:bg-accent/10 hover:text-accent text-ink-muted px-1.5 py-0.5 rounded-full transition-colors"
              >
                + {tpl.name}
              </button>
            ))}
          </div>
        )}

        {/* per-step search permissions — carried into the instantiated run */}
        {kind === 'prompt' && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => patch({ webSearch: !data.webSearch })}
              title={data.webSearch ? t('toolbar.webSearch') : t('toolbar.webSearchOff')}
              className={`text-2xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                data.webSearch ? 'bg-accent/10 text-accent' : 'bg-wash text-ink-faint hover:bg-line'
              }`}
            >
              <Globe size={12} strokeWidth={1.75} /> {t('paradigm.webSearch')}
            </button>
            <button
              onClick={() => patch({ scholarSearch: !data.scholarSearch })}
              title={data.scholarSearch ? t('toolbar.scholarSearch') : t('toolbar.scholarSearchOff')}
              className={`text-2xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                data.scholarSearch ? 'bg-accent/10 text-accent' : 'bg-wash text-ink-faint hover:bg-line'
              }`}
            >
              <GraduationCap size={12} strokeWidth={1.75} /> {t('paradigm.scholarSearch')}
            </button>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="continue" className="!bg-ink-faint !w-3.5 !h-3.5 !border-2 !border-white tdag-handle" />
    </div>
  );
}
