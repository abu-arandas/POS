import { create } from 'zustand';
import { shortId } from '../lib/utils/ids';

/**
 * Severity of a toast, which picks its colour.
 */
export type NotificationTone = 'info' | 'success' | 'error';

/**
 * One toast currently on screen.
 */
export interface Notification {
  id: string;
  message: string;
  tone: NotificationTone;
}

interface NotificationState {
  notifications: Notification[];
  push: (message: string, tone?: NotificationTone, durationMs?: number) => string;
  remove: (id: string) => void;
}

/**
 * Transient toast queue, capped at the five most recent and auto-dismissed.
 * Not persisted — a toast is meaningless after a reload.
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  push: (message, tone = 'info', durationMs = 4_000) => {
    const id = `notice-${shortId()}`;
    set((state) => ({
      notifications: [...state.notifications, { id, message, tone }].slice(-5),
    }));
    window.setTimeout(() => get().remove(id), durationMs);
    return id;
  },
  remove: (id) =>
    set((state) => ({ notifications: state.notifications.filter((notice) => notice.id !== id) })),
}));
