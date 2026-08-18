import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useStore } from '../../store';
import { isImeComposing } from '../../utils';
import { useT } from '../../i18n';
import { isViewerMode } from '../../lib/viewer';
import { toast } from '../../lib/ui-store';

export default function QuestionSection({
  nodeId,
  question,
  isEditing,
  isHuman,
  awaiting,
  placeholder,
  branchContext,
}: {
  nodeId: string;
  question: string;
  isEditing: boolean;
  /** Paradigm human turn: edits record the question without generating. */
  isHuman?: boolean;
  /** Node still waits for its own question: the box is open from the start
      (same rule as the canvas card) and click-away keeps the draft. */
  awaiting?: boolean;
  placeholder?: string;
  branchContext?: string;
}) {
  const editQuestion = useStore((s) => s.editQuestion);
  const submitHumanTurn = useStore((s) => s.submitHumanTurn);
  const setEditing = useStore((s) => s.setEditing);
  const t = useT();

  const [editValue, setEditValue] = useState('');

  const handleDoubleClickQuestion = () => {
    setEditValue(question);
    if (isViewerMode) return;
    // Editing mid-generation is ambiguous by design: stop first, then edit.
    if (useStore.getState().nodes.find((n) => n.id === nodeId)?.data.isLoading) {
      toast('info', t('question.lockedWhileGenerating'));
      return;
    }
    setEditing(nodeId, true);
  };

  const handleEditSubmit = () => {
    if (!editValue.trim()) return;
    // Unchanged question: close the editor, never regenerate
    if (editValue.trim() === question) { setEditing(nodeId, false); return; }
    if (isHuman) submitHumanTurn(nodeId, editValue.trim());
    else editQuestion(nodeId, editValue.trim());
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setEditing(nodeId, false); return; }
    if (e.key !== 'Enter' || isImeComposing(e)) return;
    // Same contract as the card editor: first-input surfaces keep
    // Enter-to-send; revision confirms explicitly (✓ button, ⌘/Ctrl+Enter
    // or Shift+Enter) and plain Enter just breaks the line.
    if (isHuman || awaiting) {
      if (!e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
  };

  // Same contract as the card editor: click-away keeps a changed draft
  // open and never generates; only an unchanged visit closes.
  const handleEditBlur = () => {
    if (editValue.trim() === question) setEditing(nodeId, false);
  };

  const autoGrowTa = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(480, el.scrollHeight)}px`;
  };

  return (
    <div className="panel-card px-4 py-3">
      <label className="text-2xs font-semibold text-accent mb-1 block">{t('panel.question')}</label>
      {branchContext && (
        <div className="mb-2 text-xs pl-3 py-1.5 pr-2 border-l-2 border-warm bg-warm/10 rounded-r text-ink-muted italic leading-relaxed">
          “{branchContext.slice(0, 240)}{branchContext.length > 240 ? '…' : ''}”
        </div>
      )}
      {(isEditing || awaiting) && !isViewerMode ? (
        <>
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={awaiting || isHuman ? undefined : handleEditBlur}
            onInput={(e) => autoGrowTa(e.currentTarget)}
            ref={autoGrowTa}
            placeholder={placeholder}
            className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accent/20"
            rows={3}
            autoFocus
          />
          {!awaiting && !isHuman && (
            <div className="flex items-center justify-end gap-2 mt-1.5">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setEditing(nodeId, false)}
                className="text-xs text-ink-muted hover:text-red-500 hover:bg-wash px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                data-edit-cancel
              >
                <X size={12} strokeWidth={2} /> {t('question.editCancel')}
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleEditSubmit}
                disabled={!editValue.trim()}
                className="text-xs bg-accent hover:bg-accent-strong disabled:opacity-30 disabled:cursor-not-allowed text-white px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                data-edit-submit
              >
                <Check size={12} strokeWidth={2.25} /> {t('question.editSubmit')}
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          onDoubleClick={handleDoubleClickQuestion}
          className="text-sm text-ink font-semibold cursor-pointer hover:bg-wash rounded-xl px-2 py-1.5 -mx-1 transition-colors max-h-[240px] overflow-y-auto"
        >
          {question}
        </div>
      )}
    </div>
  );
}
