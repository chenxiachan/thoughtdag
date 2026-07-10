import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronUp, GitBranch, Paperclip, Send, X } from 'lucide-react';
import { useStore } from '../../store';
import { buildContext } from '../../store/context-builder';
import { processFile, FILE_INPUT_ACCEPT } from '../../lib/attachments';
import SearchToggles from '../ui/SearchToggles';
import type { Attachment } from '../../types';
import { countTokens } from '../../utils';
import { useT, fmt } from '../../i18n';

const ROLE_STYLES: Record<string, string> = {
  system: 'bg-accent/10 text-accent',
  user: 'bg-wash text-ink-muted',
  assistant: 'bg-line/60 text-ink-muted',
};

export default function FollowUpInput({
  nodeId,
  branchContext,
  onClearBranchContext,
}: {
  nodeId: string;
  /** Selected response text staged as context: submitting creates an orange explore branch. */
  branchContext: string;
  onClearBranchContext: () => void;
}) {
  const addQuestion = useStore((s) => s.addQuestion);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const t = useT();

  const [continueInput, setContinueInput] = useState('');
  const [continueInheritAttachments, setContinueInheritAttachments] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const continueRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await processFile(file, {
        add: (att) => setPendingAttachments((prev) => [...prev, att]),
        update: (attId, patch) => setPendingAttachments((prev) => prev.map((a) => (a.id === attId ? { ...a, ...patch } : a))),
      });
    }
  };

  // What would a follow-up from this node actually send? Makes the core
  // "you control the context" promise visible before asking. Messages come
  // out in layer order (materials → references → conversation), so the
  // flat list below reads grouped; the summary line shows the composition.
  const preview = useMemo(() => {
    const { messages, images, layerTokens } = buildContext(nodeId, nodes, edges);
    const items = messages.map((m) => ({
      role: m.role,
      head: m.content.replace(/\s+/g, ' ').slice(0, 90),
      tokens: countTokens(m.content),
    }));
    const background = layerTokens.material + layerTokens.reference;
    return {
      items,
      layerTokens,
      // Background outweighing the live conversation is worth an amber flag
      backgroundHeavy: background > 1000 && background > layerTokens.chain,
      totalTokens: items.reduce((s, m) => s + m.tokens, 0),
      fileCount: messages.filter((m) => /^\[(PDF|File): /.test(m.content)).length + images.length,
    };
  }, [nodeId, nodes, edges]);

  // Auto-focus continue input when switching nodes or staging selected text
  useEffect(() => {
    const t = setTimeout(() => continueRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [nodeId, branchContext]);

  const submit = () => {
    if (!continueInput.trim()) return;
    addQuestion(continueInput.trim(), {
      parentId: nodeId,
      branchContext: branchContext || undefined,
      excludeAllInheritedAttachments: !continueInheritAttachments,
      initialAttachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
    });
    setContinueInput('');
    setPendingAttachments([]);
    setPreviewOpen(false);
    onClearBranchContext();
  };

  return (
    <div className="relative shrink-0 px-3 pb-3 pt-1">
      {/* Context preview popover */}
      {previewOpen && (
        <div className="absolute bottom-full left-3 right-3 mb-1.5 bg-card border border-line rounded-xl shadow-lg max-h-72 overflow-y-auto py-1.5 animate-fade-in z-30">
          <div className="px-3 py-1.5 border-b border-line">
            <span className="text-2xs text-ink-faint font-medium">{t('followup.contextTitle')}</span>
            <span className={`text-2xs ml-2 ${preview.backgroundHeavy ? 'text-amber-600' : 'text-ink-faint'}`}>
              {fmt(t('followup.layerSummary'), { a: preview.layerTokens.material, b: preview.layerTokens.reference, c: preview.layerTokens.chain })}
            </span>
            {preview.backgroundHeavy && (
              <p className="text-2xs text-amber-600 mt-0.5">{t('followup.layerWarning')}</p>
            )}
          </div>
          {preview.items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-faint italic">{t('followup.empty')}</p>
          ) : (
            preview.items.map((m, i) => (
              <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-xs border-b border-line/50 last:border-0">
                <span className={`shrink-0 px-1.5 py-0.5 rounded font-mono text-2xs ${ROLE_STYLES[m.role] ?? 'bg-wash text-ink-muted'}`}>
                  {m.role}
                </span>
                <span className="flex-1 text-ink-muted leading-snug break-words">{m.head}…</span>
                <span className="shrink-0 text-2xs text-ink-faint font-mono">{m.tokens}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="panel-card px-3.5 pt-2 pb-2.5">
      {/* Context summary line */}
      <button
        onClick={() => setPreviewOpen((v) => !v)}
        className="flex items-center gap-1 text-2xs text-ink-faint hover:text-ink-muted transition-colors mb-1.5"
        title={t('followup.previewTitle')}
      >
        <ChevronUp size={12} strokeWidth={1.75} className={`transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
        {fmt(t('followup.willSend'), { n: preview.totalTokens, m: preview.items.length })}{preview.fileCount > 0 ? fmt(t('followup.files'), { k: preview.fileCount }) : ''}
      </button>

      {/* Selected text staged as branch context — submit explores from it */}
      {branchContext && (
        <div className="text-xs pl-3 py-1.5 pr-2 mb-1.5 border-l-2 border-warm bg-warm/10 rounded-r text-ink-muted flex items-start gap-1.5">
          <span className="text-warm font-medium shrink-0"><GitBranch size={13} strokeWidth={1.75} className="inline" /> {t('node.exploringFrom')}</span>
          <span className="flex-1 min-w-0 truncate">&ldquo;{branchContext.slice(0, 90)}{branchContext.length > 90 ? '…' : ''}&rdquo;</span>
          <button onClick={onClearBranchContext} className="text-ink-faint hover:text-red-500 transition-colors shrink-0">
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Attachments staged for the NEXT follow-up node */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {pendingAttachments.map((att) => (
            <span key={att.id} className="inline-flex items-center gap-1 text-2xs bg-wash text-ink-muted px-2 py-1 rounded-full">
              <Paperclip size={11} strokeWidth={1.75} />
              <span className="max-w-[140px] truncate">{att.name}</span>
              {att.isExtracting && <span className="text-ink-faint">…</span>}
              <button onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.id !== att.id))} className="text-ink-faint hover:text-red-500 transition-colors">
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-2 bg-wash rounded-xl px-4 py-2.5 transition-shadow focus-within:ring-1 focus-within:ring-accent/40"
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); void addFiles(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
      >
        <input
          ref={continueRef}
          type="text"
          value={continueInput}
          onChange={(e) => setContinueInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t('common.followUp')}
          className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length > 0) { e.preventDefault(); void addFiles(files); }
          }}
        />
        <input ref={fileRef} type="file" accept={FILE_INPUT_ACCEPT} multiple className="hidden"
          onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
        <SearchToggles />
        <button
          onClick={() => fileRef.current?.click()}
          title={t('followup.attach')}
          className="text-ink-faint hover:text-accent transition-colors shrink-0 rounded-full w-8 h-8 flex items-center justify-center hover:bg-line"
        >
          <Paperclip size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={submit}
          disabled={!continueInput.trim()}
          className="text-ink-faint hover:text-accent disabled:opacity-30 disabled:hover:text-ink-faint transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-line"
        >
          <Send size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex gap-4 mt-1.5 px-1">
        <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
          <input type="checkbox" checked={continueInheritAttachments} onChange={(e) => setContinueInheritAttachments(e.target.checked)} className="rounded border-line text-accent focus:ring-accent w-3 h-3" />
          {t('followup.inheritAttachments')}
        </label>
      </div>
      </div>
    </div>
  );
}
