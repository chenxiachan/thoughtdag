import { useState, useRef, useCallback } from 'react';
import { ChevronRight, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { useStore } from '../../store';
import { processFile, FILE_INPUT_ACCEPT } from '../../lib/attachments';
import { useT, fmt } from '../../i18n';
import type { Attachment } from '../../types';

export default function AttachmentsSection({
  nodeId,
  attachments,
  excludedAttachmentIds,
  includedAttachmentIds,
  addAttachment,
  removeAttachment,
  toggleExcludeAttachment,
  setAttachmentRenderMode,
  getInheritedAttachments,
}: {
  nodeId: string;
  attachments: Attachment[];
  excludedAttachmentIds: string[];
  includedAttachmentIds: string[];
  addAttachment: (nodeId: string, attachment: Attachment) => void;
  removeAttachment: (nodeId: string, attachmentId: string) => void;
  toggleExcludeAttachment: (nodeId: string, attachmentId: string, ancestorExcluded?: boolean) => void;
  setAttachmentRenderMode: (nodeId: string, attachmentId: string, mode: 'full' | 'text-only') => void;
  getInheritedAttachments: (nodeId: string) => { attachment: Attachment; sourceNodeId: string; sourceQuestion: string; excludedByAncestor: boolean }[];
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inherited = getInheritedAttachments(nodeId);
  const excludeSet = new Set(excludedAttachmentIds);

  const handleFile = useCallback((file: File) => {
    void processFile(file, {
      add: (att) => addAttachment(nodeId, att),
      update: (attId, patch) => useStore.getState().setAttachmentData(nodeId, attId, patch),
    });
  }, [nodeId, addAttachment]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    for (const file of Array.from(e.dataTransfer.files)) {
      handleFile(file);
    }
  }, [handleFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) handleFile(file);
      }
    }
  }, [handleFile]);

  const hasContent = attachments.length > 0 || inherited.length > 0;

  return (
    <div className="px-4 py-3 border-b border-line">
      <details className="group" open={hasContent}>
        <summary className="text-xs text-ink-faint uppercase tracking-wider font-medium cursor-pointer hover:text-ink-muted transition-colors flex items-center gap-1.5 select-none">
          <ChevronRight size={12} strokeWidth={1.75} className="transition-transform group-open:rotate-90" />
          {t('attach.title')}
          {hasContent && (
            <span className="text-accent/60 font-medium normal-case ml-1">
              {fmt(t('attach.local'), { n: attachments.length })}{inherited.length > 0 ? ` ${fmt(t('attach.inheritedBadge'), { n: inherited.length })}` : ''}
            </span>
          )}
        </summary>
        <div className="mt-2 space-y-3">
          {/* Upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onPaste={handlePaste}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-accent bg-accent/5'
                : 'border-line hover:border-accent/40 hover:bg-surface'
            }`}
          >
            <p className="text-xs text-ink-faint">
              {isDragging ? t('attach.dropHere') : <><Paperclip size={14} strokeWidth={1.75} className="inline" /> {t('attach.upload')}</>}
            </p>
            <p className="text-2xs text-ink-faint/60 mt-0.5">{t('attach.types')}</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={FILE_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                for (const file of Array.from(e.target.files || [])) {
                  handleFile(file);
                }
                e.target.value = '';
              }}
            />
          </div>

          {/* Local attachments */}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-2xs text-ink-faint font-medium uppercase">{t('attach.thisNode')}</span>
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 bg-wash rounded-lg px-3 py-2 group">
                  {att.thumbnailUrl ? (
                    <img src={att.thumbnailUrl} className="w-8 h-8 rounded object-cover shrink-0" alt={att.name} />
                  ) : (
                    <span className="w-8 h-8 rounded bg-line flex items-center justify-center text-xs text-ink-muted shrink-0"><FileText size={16} strokeWidth={1.75} /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink truncate">{att.name}</p>
                    <p className="text-2xs text-ink-faint">
                      {(att.size / 1024).toFixed(1)} KB
                      {att.isExtracting && <span className="ml-1 text-accent"><Loader2 className="animate-spin inline" size={12} strokeWidth={1.75} /> {t('attach.extracting')}</span>}
                      {att.numPages != null && <span className="ml-1 text-ink-muted">• {fmt(t('attach.pages'), { n: att.numPages })}</span>}
                      {att.renderMode && <span className="ml-1 text-ink-muted">• {att.renderMode === 'full' ? t('attach.textVision') : t('attach.textOnly')}</span>}
                    </p>
                    {/* Render mode toggle for PDFs with >10 pages */}
                    {att.type === 'application/pdf' && att.numPages != null && att.numPages > 10 && !att.isExtracting && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-2xs text-amber-600">{fmt(t('attach.pagesWarning'), { n: att.numPages, tok: (att.numPages * 1500).toLocaleString() })}</span>
                        <button
                          onClick={() => setAttachmentRenderMode(nodeId, att.id, att.renderMode === 'full' ? 'text-only' : 'full')}
                          className={`text-2xs px-2 py-0.5 rounded-lg transition-colors ${
                            att.renderMode === 'full'
                              ? 'bg-accent/10 text-accent'
                              : 'bg-line text-ink-muted'
                          }`}
                        >
                          {att.renderMode === 'full' ? t('attach.switchTextOnly') : t('attach.enableVision')}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeAttachment(nodeId, att.id)}
                    className="text-ink-faint hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                  >
                    <X size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inherited attachments */}
          {inherited.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-2xs text-ink-faint font-medium uppercase">{t('attach.inheritedFrom')}</span>
              {inherited.map(({ attachment: att, sourceQuestion, excludedByAncestor }) => {
                const isExcludedSelf = excludeSet.has(att.id);
                const includeSet = new Set(includedAttachmentIds);
                const isOverridden = includeSet.has(att.id); // re-included despite ancestor exclusion
                const isEffectivelyExcluded = isExcludedSelf || (excludedByAncestor && !isOverridden);
                return (
                  <div key={att.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-all ${isEffectivelyExcluded ? 'bg-red-50/50 opacity-50' : 'bg-wash'}`}>
                    {att.thumbnailUrl ? (
                      <img src={att.thumbnailUrl} className="w-8 h-8 rounded object-cover shrink-0" alt={att.name} />
                    ) : (
                      <span className="w-8 h-8 rounded bg-line flex items-center justify-center text-xs text-ink-muted shrink-0"><FileText size={16} strokeWidth={1.75} /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${isEffectivelyExcluded ? 'text-ink-faint line-through' : 'text-ink'}`}>{att.name}</p>
                      <p className="text-2xs text-ink-faint truncate">
                        ← {sourceQuestion.slice(0, 40)}{sourceQuestion.length > 40 ? '…' : ''}
                        {excludedByAncestor && !isOverridden && !isExcludedSelf && <span className="ml-1 text-amber-500">• {t('attach.excludedUpstream')}</span>}
                        {isOverridden && <span className="ml-1 text-green-500">• {t('attach.reIncluded')}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleExcludeAttachment(nodeId, att.id, excludedByAncestor)}
                      className={`text-xs px-2 py-1 rounded-lg transition-colors shrink-0 ${
                        isEffectivelyExcluded
                          ? 'bg-red-100 text-red-500 hover:bg-red-200'
                          : isOverridden
                          ? 'bg-green-100 text-green-600 hover:bg-green-200'
                          : 'bg-line text-ink-muted hover:bg-accent/10 hover:text-accent'
                      }`}
                      title={excludedByAncestor && !isOverridden ? t('attach.titleExcludedUpstream') : isOverridden ? t('attach.titleReIncluded') : isExcludedSelf ? t('attach.titleInclude') : t('attach.titleExclude')}
                    >
                      {excludedByAncestor && !isOverridden && !isExcludedSelf ? t('attach.btnUpstream') : isOverridden ? t('attach.btnReIncluded') : isExcludedSelf ? t('attach.btnExcluded') : t('attach.btnIncluded')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {!hasContent && (
            <p className="text-2xs text-ink-faint italic">{t('attach.empty')}</p>
          )}
        </div>
      </details>
    </div>
  );
}
