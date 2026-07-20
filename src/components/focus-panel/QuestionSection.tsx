import { useState } from 'react';
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
    if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') setEditing(nodeId, false);
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
            onBlur={awaiting || isHuman ? undefined : handleEditSubmit}
            placeholder={placeholder}
            className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accent/20"
            rows={3}
            autoFocus
          />
          {!awaiting && !isHuman && (
            <div className="text-2xs text-ink-faint mt-1 px-1">
              {editValue.trim() !== question ? t('question.editHintChanged') : t('question.editHintUnchanged')}
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
