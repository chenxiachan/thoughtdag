import { useRef, useState } from 'react';
import { Handle, NodeResizeControl, Position, type NodeProps } from '@xyflow/react';
import { ExternalLink, FileText, GripVertical, Link2, Link2Off, Loader2, Paperclip, RefreshCw, StickyNote, Trash2, X } from 'lucide-react';
import type { ThoughtNode as ThoughtNodeType } from '../types';
import { useStore } from '../store';
import { triggerParadigmCascade } from '../store/streaming';
import { fetchLinkIntoNode, ingestFiles } from '../lib/content';
import { FILE_INPUT_ACCEPT } from '../lib/attachments';
import { Markdown } from './Markdown';
import { countTokens } from '../utils';
import { useT, fmt } from '../i18n';

// Content nodes: canvas material, not turns. A note (markdown), a file
// (attachments) or a link (stamped web snapshot) that never generates — it
// feeds downstream context ONLY via its outgoing edge (the One Rule), so it
// has no target handle: nothing flows INTO material. autoLayout never moves
// them. In a paradigm, an empty content node is a MATERIAL SLOT: the
// cascade waits until the human fills it, like a human turn.

export default function ContentNode({ id, data, selected }: NodeProps<ThoughtNodeType>) {
  const t = useT();
  const deleteNode = useStore((s) => s.deleteNode);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  // Blindspot #8: on-canvas ≠ in-context — unlinked material is decoration
  const isLinked = useStore((s) => s.edges.some((e) => e.source === id));

  const kind = data.stepKind === 'file' ? 'file' : data.stepKind === 'link' ? 'link' : 'note';
  const [editing, setEditing] = useState(kind === 'note' && !data.question);
  const [draft, setDraft] = useState(data.question);
  const fileRef = useRef<HTMLInputElement>(null);

  // Blindspot #2: undo history is a full-graph snapshot — commit the note
  // ONCE on blur, never per keystroke.
  const commit = () => {
    setEditing(false);
    const text = draft.trim() === '' ? '' : draft;
    if (text === data.question) return;
    useStore.getState().pushHistory();
    useStore.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, question: text, tokenCount: countTokens(text) } } : n)),
    }));
    // Filling a material slot advances a waiting paradigm run (idempotent)
    triggerParadigmCascade(useStore.getState, id);
  };

  const attachments = data.attachments || [];
  const linkLoading = kind === 'link' && !data.question && !data.linkTitle?.startsWith('⚠');
  const linkDomain = (() => { try { return new URL(data.linkUrl ?? '').hostname; } catch { return data.linkUrl ?? ''; } })();

  const headerIcon = kind === 'note'
    ? <StickyNote size={14} strokeWidth={1.75} className="text-amber-600 shrink-0" />
    : kind === 'link'
      ? <Link2 size={14} strokeWidth={1.75} className="text-accent shrink-0" />
      : <Paperclip size={14} strokeWidth={1.75} className="text-ink-muted shrink-0" />;

  return (
    <div
      className={`w-full min-w-[340px] rounded-xl shadow-sm border-2 animate-fade-in transition-colors duration-200 ${
        kind === 'note' ? 'bg-amber-50/90 border-amber-200' : 'bg-card border-line'
      } ${selectedNodeId === id ? 'ring-2 ring-accent selected-glow' : ''}`}
      onClick={() => setSelectedNodeId(id)}
      onDrop={async (e) => {
        if (kind !== 'file') return;
        e.preventDefault();
        e.stopPropagation();
        await ingestFiles(id, e.dataTransfer.files);
      }}
      onDragOver={(e) => { if (kind === 'file') { e.preventDefault(); e.stopPropagation(); } }}
    >
      {/* Pure source: material feeds context, nothing flows INTO it — hence no target handle. */}

      {/* header: drag handle + identity + linked state + delete */}
      <div className={`flex items-center justify-between px-4 py-2 border-b cursor-grab active:cursor-grabbing drag-handle ${kind === 'note' ? 'border-amber-200/70' : 'border-line/70'}`}>
        <div className="flex items-center gap-2 min-w-0">
          {headerIcon}
          {kind === 'link'
            ? <span className="text-2xs text-ink-muted truncate">{linkDomain}</span>
            : <span className="text-2xs text-ink-faint font-mono">{kind === 'note' ? `${data.tokenCount} tok` : `${attachments.length}`}</span>}
          {!isLinked && (
            <span className="text-2xs text-ink-faint bg-wash px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0" title={t('content.unlinkedTitle')}>
              <Link2Off size={11} strokeWidth={1.75} /> {t('content.unlinked')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {kind === 'link' && data.linkUrl && (
            <a
              href={data.linkUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={t('content.linkOpen')}
              className="text-ink-faint hover:text-accent rounded-full w-6 h-6 flex items-center justify-center transition-colors"
            >
              <ExternalLink size={13} strokeWidth={1.75} />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode(id); }}
            className="text-ink-faint hover:text-red-500 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 nodrag">
        {kind === 'note' && (
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
              className="markdown-body text-sm text-ink leading-relaxed max-h-[420px] overflow-y-auto cursor-text nopan nowheel"
              title={t('content.noteEditTitle')}
            >
              {data.question
                ? <Markdown>{data.question}</Markdown>
                : <span className="text-ink-faint italic text-xs">{t('content.notePlaceholder')}</span>}
            </div>
          )
        )}

        {kind === 'link' && (
          linkLoading ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted py-2">
              <Loader2 size={14} strokeWidth={1.75} className="animate-spin text-accent" /> {t('content.linkFetching')}
            </div>
          ) : (
            <div className="space-y-1.5">
              {data.linkTitle && (
                <div className={`text-sm font-semibold leading-snug ${data.linkTitle.startsWith('⚠') ? 'text-red-600' : 'text-ink'}`}>{data.linkTitle}</div>
              )}
              {data.linkTitle?.startsWith('⚠') && data.linkUrl && (
                <button
                  onClick={(e) => { e.stopPropagation(); void fetchLinkIntoNode(id, data.linkUrl!); }}
                  className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw size={13} strokeWidth={1.75} /> {t('common.retry')}
                </button>
              )}
              {data.question && (
                <div className="text-xs text-ink-muted leading-relaxed max-h-[200px] overflow-y-auto nopan nowheel whitespace-pre-wrap">
                  {data.question.slice(0, 1200)}{data.question.length > 1200 ? '…' : ''}
                </div>
              )}
              {data.linkFetchedAt && (
                <div className="text-2xs text-ink-faint font-mono">
                  {fmt(t('content.linkStamp'), { date: data.linkFetchedAt.slice(0, 10) })} · {data.tokenCount} tok
                </div>
              )}
            </div>
          )
        )}

        {kind === 'file' && (
          <div className="space-y-1.5">
            {attachments.map((att) => (
              att.type.startsWith('image/') ? (
                // Pasted images live on the canvas as the image itself —
                // resize the card (right edge) to scale it
                <div key={att.id} className="relative group">
                  <img
                    src={`data:${att.type};base64,${att.content}`}
                    alt={att.name}
                    className="w-full rounded-lg border border-line/60"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); removeAttachment(id, att.id); }}
                    className="absolute top-1.5 right-1.5 bg-ink/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <div key={att.id} className="flex items-center gap-2 bg-wash rounded-lg px-2.5 py-2 group">
                  <FileText size={16} strokeWidth={1.75} className="text-ink-muted shrink-0" />
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
              )
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
              onChange={(e) => { if (e.target.files) void ingestFiles(id, e.target.files); e.target.value = ''; }}
            />
          </div>
        )}
      </div>

      {/* Horizontal resize (images scale with the card width) */}
      {selected && (
        <NodeResizeControl
          position="right"
          minWidth={320}
          maxWidth={860}
          style={{ background: 'transparent', border: 'none', width: 14 }}
        >
          <GripVertical size={13} strokeWidth={1.75} className="text-ink-faint absolute top-1/2 -translate-y-1/2 -right-1" />
        </NodeResizeControl>
      )}

      <Handle type="source" position={Position.Bottom} id="continue" className="!bg-ink-faint !w-3 !h-3 !border-2 !border-white" />
    </div>
  );
}
