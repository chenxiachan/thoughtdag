import { useState } from 'react';
import { useStore } from '../../store';
import { useT } from '../../i18n';

export default function QuestionSection({
  nodeId,
  question,
  isEditing,
  isHuman,
}: {
  nodeId: string;
  question: string;
  isEditing: boolean;
  /** Paradigm human turn: edits record the question without generating. */
  isHuman?: boolean;
}) {
  const editQuestion = useStore((s) => s.editQuestion);
  const submitHumanTurn = useStore((s) => s.submitHumanTurn);
  const setEditing = useStore((s) => s.setEditing);
  const t = useT();

  const [editValue, setEditValue] = useState('');

  const handleDoubleClickQuestion = () => {
    setEditValue(question);
    setEditing(nodeId, true);
  };

  const handleEditSubmit = () => {
    if (!editValue.trim()) return;
    if (isHuman) submitHumanTurn(nodeId, editValue.trim());
    else editQuestion(nodeId, editValue.trim());
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') setEditing(nodeId, false);
  };

  return (
    <div className="panel-card px-4 py-3">
      <label className="text-2xs font-semibold text-accent mb-1 block">{t('panel.question')}</label>
      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditSubmit}
          className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-accent/20"
          rows={3}
          autoFocus
        />
      ) : (
        <div
          onDoubleClick={handleDoubleClickQuestion}
          className="text-sm text-ink font-semibold cursor-pointer hover:bg-wash rounded-xl px-2 py-1.5 -mx-1 transition-colors"
        >
          {question}
        </div>
      )}
    </div>
  );
}
