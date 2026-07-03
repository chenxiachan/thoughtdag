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
    <div className="px-4 py-3 border-b border-[#E8E5E0]">
      <label className="text-xs text-[#B8B2A8] uppercase tracking-wide font-medium mb-1.5 block">Question</label>
      {isEditing ? (
        <textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={handleEditSubmit}
          className="w-full bg-[#F5F3F0] border border-[#6B5CE7] rounded-xl p-3 text-sm text-[#1A1A1A] resize-none focus:outline-none focus:ring-2 focus:ring-[#6B5CE7]/20"
          rows={3}
          autoFocus
        />
      ) : (
        <div
          onDoubleClick={handleDoubleClickQuestion}
          className="text-sm text-[#6B5CE7] font-medium cursor-pointer hover:bg-[#F5F3F0] rounded-xl px-2 py-1.5 -mx-1 transition-colors"
        >
          {question}
        </div>
      )}
    </div>
  );
}
