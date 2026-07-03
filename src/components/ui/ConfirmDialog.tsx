import { useEffect } from 'react';
import { useUiStore } from '../../lib/ui-store';

export default function ConfirmDialog() {
  const request = useUiStore((s) => s.confirmRequest);
  const resolveConfirm = useUiStore((s) => s.resolveConfirm);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // Capture-phase + stopPropagation keeps Delete/undo shortcuts in the
      // canvas from firing underneath the dialog.
      e.stopPropagation();
      if (e.key === 'Escape') resolveConfirm(false);
      if (e.key === 'Enter') resolveConfirm(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [request, resolveConfirm]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/25 flex items-center justify-center animate-fade-in"
      onClick={() => resolveConfirm(false)}
    >
      <div
        className="bg-card border border-line rounded-xl shadow-xl w-[380px] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {request.title && (
          <h3 className="text-sm font-semibold text-ink mb-1.5">{request.title}</h3>
        )}
        <p className="text-sm text-ink-muted leading-relaxed">{request.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => resolveConfirm(false)}
            className="text-xs text-ink-muted hover:text-ink px-4 py-2 rounded-lg hover:bg-wash transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => resolveConfirm(true)}
            autoFocus
            className={`text-xs text-white px-4 py-2 rounded-lg transition-colors ${
              request.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-strong'
            }`}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
