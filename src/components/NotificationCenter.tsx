import { X } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';

const toneClasses = {
  info: 'border-slate-600 bg-slate-900 text-slate-100',
  success: 'border-emerald-500/50 bg-emerald-950/90 text-emerald-100',
  error: 'border-rose-500/50 bg-rose-950/90 text-rose-100',
} as const;

/**
 * Renders the active toasts. Mounted once at the app root.
 */
export default function NotificationCenter() {
  const notifications = useNotificationStore((state) => state.notifications);
  const remove = useNotificationStore((state) => state.remove);

  return (
    <div
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:end-6 sm:w-96"
      aria-live="polite"
      aria-atomic="false"
    >
      {notifications.map((notice) => (
        <div
          key={notice.id}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${toneClasses[notice.tone]}`}
        >
          <p className="min-w-0 flex-1 break-words">{notice.message}</p>
          <button
            type="button"
            onClick={() => remove(notice.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-md p-1 opacity-70 hover:bg-white/10 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
