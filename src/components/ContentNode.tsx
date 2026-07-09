import { useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, Link2Off, Paperclip, StickyNote, Trash2, X } from 'lucide-react';
import type { ThoughtNode as ThoughtNodeType } from '../types';
import { useStore } from '../store';
import { triggerParadigmCascade } from '../store/streaming';
import { processFile, FILE_INPUT_ACCEPT } from '../lib/attachments';
import { Markdown } from './Markdown';
import { countTokens } from '../utils';
import { useT } from '../i18n';

// Content nodes: canvas material, not turns. A note (markdown text) or a
// file (attachments) that never generates — it feeds downstream context
// ONLY via edges (the One Rule). autoLayout never moves them. In a
// paradigm, an empty content node is a MATERIAL SLOT: the cascade waits
// until the human fills it, same pause semantics as a human turn.

export default function ContentNode({ id, data }: NodeProps<ThoughtNodeType>) {
  const t = useT();
  const deleteNode = useStore((s) => s.deleteNode);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  // Blindspot #8: on-canvas ≠ in-context — unlinked material is decoration
  const isLinked = useStore((s) => s.edges.some((e) => e.source === id || e.target === id));

  const isNote = data.stepKind === 'note';
  const [editing, setEditing] = useState(isNote && !data.question);
  const [draft, setDraft] = useState(data.question);
  const fileRef = useRef<HTMLInputElement>(null);

  // Blindspot #2: undo history is a full-graph snapshot — commit the note
  // ONCE on blur, never per keystroke.
  const commit = () => {
    setEditing(false);
    const text = draft.trim() === '' ? '' : draft;
    if (text === data.question) return;
    const st = useStore.getState();
    st.pushHistory();
    useStore.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, question: text, tokenCount: countTokens(text) } } : n)),
    }));
    // Filling a material slot advances a waiting paradigm run (idempotent)
    triggerParadigmCascade(useStore.getState, id);
  };

  const addFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await processFile(file, {
        add: (att) => {
          addAttachment(id, att);
          triggerParadigmCascade(useStore.getState, id);
        },
        update: (attId, patch) => {
          useStore.getState().setAttachmentData(id, attId, patch);
          // PDF text may arrive late — re-check readiness after extraction
          triggerParadigmCascade(useStore.getState, id);
        },
      });
    }
  };

  const attachments = data.attachments || [];

  return (
    <div
      className={`rounded-xl w-[380px] shadow-sm border-2 animate-fade-in transition-all duration-200 ${
        isNote ? 'bg-amber-50/90 border-amber-200' : 'bg-card border-line'
      } ${selectedNodeId === id ? 'ring-2 ring-accent selected-glow' : ''}`}
      onClick={() => setSelectedNodeId(id)}
      onDrop={async (e) => {
        if (isNote) return;
        e.preventDefault();
        e.stopPropagation();
        await addFiles(e.dataTransfer.files);
      }}
      onDragOver={(e) => { if (!isNote) { e.preventDefault(); e.stopPropagation(); } }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-ink-faint !w-3 !h-3 !border-2 !border-white" />

      {/* header: drag handle + identity + linked state + delete */}
      <div className={`flex items-center justify-between px-4 py-2 border-b cursor-grab active:cursor-grabbing drag-handle ${isNote ? 'border-amber-200/70' : 'border-line/70'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {isNote
            ? <StickyNote size={14} strokeWidth={1.75} className="text-amber-600 shrink-0" />
            : <Paperclip size={14} strokeWidth={1.75} className="text-ink-muted shrink-0" />}
          <span className="text-2xs text-ink-faint font-mono">
            {isNote ? `${data.tokenCount} tok` : `${attachments.length}`}
          </span>
          {!isLinked && (
            <span className="text-2xs text-ink-faint bg-wash px-1.5 py-0.5 rounded-full flex items-center gap-1" title={t('content.unlinkedTitle')}>
              <Link2Off size={11} strokeWidth={1.75} /> {t('content.unlinked')}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
          className="text-ink-faint hover:text-red-500 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
        >
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-4 py-3 nodrag">
        {isNote ? (
          editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Escape') commit(); }}
              placeholder={t('content.notePlaceholder')}
              rows={5}
              autoFocus
              className="w-full bg-transparent text-sm text-ink resize-y focus:outline-none placeholder-ink-faint leading-relaxed nopan"
            />
          ) : (
            <div
              onDoubleClick={() => { setDraft(data.question); setEditing(true); }}
              className="markdown-body text-sm text-ink leading-relaxed max-h-[360px] overflow-y-auto cursor-text nopan nowheel"
              title={t('content.noteEditTitle')}
            >
              {data.question
                ? <Markdown>{data.question}</Markdown>
                : <span className="text-ink-faint italic text-xs">{t('content.notePlaceholder')}</span>}
            </div>
          )
        ) : (
          <div className="space-y-1.5">
            {attachments.map((att) => (
              <div key={att.id} className="flex items-center gap-2 bg-wash rounded-lg px-2.5 py-2 group">
                {att.thumbnailUrl
                  ? <img src={att.thumbnailUrl} className="w-9 h-9 rounded object-cover shrink-0" alt={att.name} />
                  : <FileText size={16} strokeWidth={1.75} className="text-ink-muted shrink-0" />}
                <span className="text-xs text-ink flex-1 truncate">{att.name}</span>
                {att.isExtracting && <span className="text-2xs text-accent shrink-0">{t('attach.extracting')}</span>}
                {att.numPages != null && <span className="text-2xs text-ink-faint shrink-0">{att.numPages}p</span>}
                <button
                  onClick={(e) => { e.stopPropagation(); removeAttachment(id, att.id); }}
                  className="text-ink-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <X size={13} strokeWidth={1.75} />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className={`w-full border-2 border-dashed border-line hover:border-accent/40 hover:bg-accent/5 rounded-lg text-xs text-ink-faint hover:text-ink-muted transition-colors ${attachments.length === 0 ? 'py-6' : 'py-2'}`}
            >
              {t('attach.upload')}
              {attachments.length === 0 && <span className="block text-2xs mt-1">{t('attach.types')}</span>}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={FILE_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="continue" className="!bg-ink-faint !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
