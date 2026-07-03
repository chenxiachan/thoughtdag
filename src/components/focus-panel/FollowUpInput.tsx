import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useStore } from '../../store';

export default function FollowUpInput({
  nodeId,
  dimmed,
}: {
  nodeId: string;
  dimmed: boolean;
}) {
  const addQuestion = useStore((s) => s.addQuestion);

  const [continueInput, setContinueInput] = useState('');
  const [continueInheritRole, setContinueInheritRole] = useState(true);
  const [continueInheritAttachments, setContinueInheritAttachments] = useState(true);
  const continueRef = useRef<HTMLInputElement>(null);

  // Auto-focus continue input when switching to a new node
  useEffect(() => {
    const t = setTimeout(() => continueRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [nodeId]);

  return (
    <div className={`shrink-0 border-t border-line px-4 py-3 bg-card ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 bg-wash rounded-xl px-4 py-2.5">
        <input
          ref={continueRef}
          type="text"
          value={continueInput}
          onChange={(e) => setContinueInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (continueInput.trim()) {
                addQuestion(continueInput.trim(), { parentId: nodeId, inheritRole: continueInheritRole ? undefined : false, excludeAllInheritedAttachments: !continueInheritAttachments });
                setContinueInput('');
                setContinueInheritRole(true);
              }
            }
          }}
          placeholder="Follow up..."
          className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none"
        />
        <button
          onClick={() => {
            if (continueInput.trim()) {
              addQuestion(continueInput.trim(), { parentId: nodeId, inheritRole: continueInheritRole ? undefined : false, excludeAllInheritedAttachments: !continueInheritAttachments });
              setContinueInput('');
              setContinueInheritRole(true);
            }
          }}
          disabled={!continueInput.trim()}
          className="text-ink-faint hover:text-accent disabled:opacity-30 disabled:hover:text-ink-faint transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-line"
        >
          <Send size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex gap-4 mt-1.5 px-1">
        <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
          <input type="checkbox" checked={continueInheritRole} onChange={(e) => setContinueInheritRole(e.target.checked)} className="rounded border-line text-accent focus:ring-accent w-3 h-3" />
          Inherit role
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer select-none">
          <input type="checkbox" checked={continueInheritAttachments} onChange={(e) => setContinueInheritAttachments(e.target.checked)} className="rounded border-line text-accent focus:ring-accent w-3 h-3" />
          Inherit attachments
        </label>
      </div>
    </div>
  );
}
