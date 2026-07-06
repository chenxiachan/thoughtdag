import { useState } from 'react';
import { ClipboardCopy, CornerDownLeft, Copy, Eye, FileDown, GitBranch, RefreshCw, Repeat2, Square, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { contextChainMarkdown, downloadMarkdown, copyText } from '../../lib/export';
import { ROLE_TEMPLATES } from '../../lib/role-templates';
import ModelPicker from '../ui/ModelPicker';
import { useT, useI18n } from '../../i18n';

export default function ActionsSection({
  nodeId,
  isLoading,
  dimmed,
  branchInput,
  setBranchInput,
  showBranchInput,
  setShowBranchInput,
  branchContext,
  setBranchContext,
  branchInheritRole,
  setBranchInheritRole,
}: {
  nodeId: string;
  isLoading: boolean;
  dimmed: boolean;
  branchInput: string;
  setBranchInput: (value: string) => void;
  showBranchInput: boolean;
  setShowBranchInput: (value: boolean) => void;
  branchContext: string;
  setBranchContext: (value: string) => void;
  branchInheritRole: boolean;
  setBranchInheritRole: (value: boolean) => void;
}) {
  const addQuestion = useStore((s) => s.addQuestion);
  const regenerate = useStore((s) => s.regenerate);
  const deleteNode = useStore((s) => s.deleteNode);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const stopGeneration = useStore((s) => s.stopGeneration);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const attachEvaluator = useStore((s) => s.attachEvaluator);
  const setNodeModel = useStore((s) => s.setNodeModel);
  const nodeModel = useStore((s) => s.nodes.find((n) => n.id === nodeId)?.data.model);
  const setAutoRerun = useStore((s) => s.setAutoRerun);
  const nodeData = useStore((s) => s.nodes.find((n) => n.id === nodeId)?.data);
  const isAuto = nodeData ? (nodeData.autoRerun ?? nodeData.evaluatorTrigger === 'auto') : false;
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [customRole, setCustomRole] = useState('');

  const handleBranchSubmit = () => {
    if (!branchInput.trim()) return;
    addQuestion(branchInput.trim(), {
      parentId: nodeId,
      branchContext: branchContext || undefined,
      inheritRole: branchInheritRole ? undefined : false,
    });
    setBranchInput('');
    setShowBranchInput(false);
    setBranchContext('');
    setBranchInheritRole(true);
  };

  return (
    <div className={`px-4 py-3 border-b border-line ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <label className="text-xs text-ink-faint uppercase tracking-wider font-medium mb-2 block">{t('actions.title')}</label>
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary */}
        {isLoading ? (
          <button
            onClick={() => stopGeneration(nodeId)}
            className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Square size={12} strokeWidth={1.75} fill="currentColor" />
            {t('actions.stop')}
          </button>
        ) : (
          <button
            onClick={() => regenerate(nodeId)}
            className="text-xs bg-accent/10 hover:bg-accent/20 text-accent font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={14} strokeWidth={1.75} />
            {t('common.regenerate')}
          </button>
        )}
        {/* Secondary */}
        <button
          onClick={() => duplicateNode(nodeId)}
          className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Copy size={14} strokeWidth={1.75} />
          {t('common.duplicate')}
        </button>
        <button
          onClick={() => downloadMarkdown(contextChainMarkdown(nodeId))}
          title={t('actions.exportTitle')}
          className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <FileDown size={14} strokeWidth={1.75} /> {t('common.exportMd')}
        </button>
        <button
          onClick={() => void copyText(contextChainMarkdown(nodeId))}
          title={t('actions.copyTitle')}
          className="text-xs bg-wash hover:bg-line text-ink-muted px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <ClipboardCopy size={14} strokeWidth={1.75} /> {t('actions.copyMd')}
        </button>
        <button
          onClick={() => setEvaluatorPickerOpen((v) => !v)}
          title={t('evaluator.attachTitle')}
          className={`text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            evaluatorPickerOpen ? 'bg-watch/10 text-watch' : 'bg-wash hover:bg-line text-ink-muted'
          }`}
        >
          <Eye size={14} strokeWidth={1.75} /> {t('evaluator.attach')}
        </button>
        <ModelPicker compact value={nodeModel} onChange={(m) => setNodeModel(nodeId, m)} />
        <button
          onClick={() => setAutoRerun(nodeId, !isAuto)}
          title={t('rerun.toggleTitle')}
          className={`text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
            isAuto ? 'bg-accent/10 text-accent' : 'bg-wash hover:bg-line text-ink-muted'
          }`}
        >
          <Repeat2 size={14} strokeWidth={1.75} /> {isAuto ? t('rerun.auto') : t('rerun.label')}
        </button>
        {/* Destructive, kept apart on the right */}
        <button
          onClick={() => { deleteNode(nodeId); setSelectedNodeId(null); }}
          className="ml-auto text-xs text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
        >
          <Trash2 size={14} strokeWidth={1.75} className="inline" /> {t('common.delete')}
        </button>
      </div>
      {evaluatorPickerOpen && (
        <div className="mt-3 border border-line rounded-xl p-3 space-y-1.5 bg-surface/50">
          <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium mb-2">{t('evaluator.pickRole')}</p>
          {ROLE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => {
                setEvaluatorPickerOpen(false);
                void attachEvaluator(nodeId, tpl.prompt, lang === 'zh' ? tpl.nameZh : tpl.nameEn);
              }}
              className="w-full text-left text-xs text-ink hover:bg-wash rounded-lg px-3 py-2 transition-colors flex items-center gap-2"
            >
              <Eye size={13} strokeWidth={1.75} className="text-watch shrink-0" />
              {lang === 'zh' ? tpl.nameZh : tpl.nameEn}
            </button>
          ))}
          <div className="flex gap-1.5 pt-1.5 border-t border-line/60">
            <input
              type="text"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              placeholder={t('evaluator.customPlaceholder')}
              className="flex-1 text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-watch/50 bg-card"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customRole.trim()) {
                  setEvaluatorPickerOpen(false);
                  void attachEvaluator(nodeId, customRole.trim(), t('evaluator.badge'));
                  setCustomRole('');
                }
              }}
            />
            <button
              onClick={() => {
                if (!customRole.trim()) return;
                setEvaluatorPickerOpen(false);
                void attachEvaluator(nodeId, customRole.trim(), t('evaluator.badge'));
                setCustomRole('');
              }}
              disabled={!customRole.trim()}
              className="text-xs bg-watch/90 hover:bg-watch text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-30 shrink-0"
            >
              {t('evaluator.create')}
            </button>
          </div>
        </div>
      )}
      {showBranchInput && (
        <div className="mt-3">
          {branchContext && (
            <div className="text-xs pl-3 py-1.5 pr-2 mb-2 border-l-2 border-accent bg-accent/5 rounded-r text-ink-muted">
              <span className="text-accent font-medium"><GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('node.exploringFrom')}</span>
              &ldquo;{branchContext.slice(0, 100)}{branchContext.length > 100 ? '…' : ''}&rdquo;
            </div>
          )}
          <div className="flex items-center gap-2 bg-wash rounded-xl px-3 py-2 transition-shadow focus-within:ring-1 focus-within:ring-accent/40">
            <input
              type="text"
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleBranchSubmit(); }
                if (e.key === 'Escape') { setShowBranchInput(false); setBranchContext(''); }
              }}
              placeholder={t('actions.explorePlaceholder')}
              className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleBranchSubmit}
              disabled={!branchInput.trim()}
              className="text-accent hover:text-accent-strong disabled:opacity-30 transition-colors"
            >
              <CornerDownLeft size={16} strokeWidth={1.75} />
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-muted mt-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={branchInheritRole} onChange={(e) => setBranchInheritRole(e.target.checked)} className="rounded border-line text-accent focus:ring-accent w-3 h-3" />
            {t('common.inheritRole')}
          </label>
        </div>
      )}
    </div>
  );
}
