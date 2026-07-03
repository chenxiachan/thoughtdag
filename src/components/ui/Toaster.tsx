import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useUiStore, type ToastItem } from '../../lib/ui-store';

const KIND_STYLES: Record<ToastItem['kind'], string> = {
  error: 'border-red-200 bg-red-50 text-red-700',
  success: 'border-green-200 bg-green-50 text-green-700',
  info: 'border-line bg-card text-ink-muted',
};

const KIND_ICONS: Record<ToastItem['kind'], typeof Info> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export default function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-[380px]">
      {toasts.map((t) => {
        const Icon = KIND_ICONS[t.kind];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-2.5 border rounded-xl shadow-lg px-4 py-3 animate-fade-in ${KIND_STYLES[t.kind]}`}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed flex-1 break-words">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
