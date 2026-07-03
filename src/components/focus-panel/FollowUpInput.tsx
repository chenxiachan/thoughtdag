import { useState, useRef, useEffect } from 'react';
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
    <div className={`shrink-0 border-t border-[#E8E5E0] px-4 py-3 bg-white ${dimmed ? 'opacity-40 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 bg-[#F5F3F0] rounded-xl px-4 py-2.5">
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
          className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder-[#B8B2A8] focus:outline-none"
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
          className="text-[#B8B2A8] hover:text-[#6B5CE7] disabled:opacity-30 disabled:hover:text-[#B8B2A8] transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-[#E8E5E0]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div className="flex gap-4 mt-1.5 px-1">
        <label className="flex items-center gap-2 text-xs text-[#6B6560] cursor-pointer select-none">
          <input type="checkbox" checked={continueInheritRole} onChange={(e) => setContinueInheritRole(e.target.checked)} className="rounded border-[#E8E5E0] text-[#6B5CE7] focus:ring-[#6B5CE7] w-3 h-3" />
          Inherit role
        </label>
        <label className="flex items-center gap-2 text-xs text-[#6B6560] cursor-pointer select-none">
          <input type="checkbox" checked={continueInheritAttachments} onChange={(e) => setContinueInheritAttachments(e.target.checked)} className="rounded border-[#E8E5E0] text-[#6B5CE7] focus:ring-[#6B5CE7] w-3 h-3" />
          Inherit attachments
        </label>
      </div>
    </div>
  );
}
