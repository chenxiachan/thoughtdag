import { useState } from 'react';
import { useStore } from '../../store';

export default function QuestionSection({
  nodeId,
  question,
  isEditing,
}: {
  nodeId: string;
  question: string;
  isEditing: boolean;
}) {
  const editQuestion = useStore((s) => s.editQuestion);
  const setEditing = useStore((s) => s.setEditing);

  const [editValue, setEditValue] = useState('');

  const handleDoubleClickQuestion = () => {
    setEditValue(question);
    setEditing(nodeId, true);
  };

  const handleEditSubmit = () => {
    if (editValue.trim()) {
      editQuestion(nodeId, editValue.trim());
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') setEditing(nodeId, false);
  };

  return (
    <div className="px-4 py-3 border-b border-line">
      <label className="text-xs text-ink-faint uppercase tracking-wider font-medium mb-1.5 block">Question</label>
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
          className="text-sm text-accent font-medium cursor-pointer hover:bg-wash rounded-xl px-2 py-1.5 -mx-1 transition-colors"
        >
          {question}
        </div>
      )}
    </div>
  );
}
