import { NotificationTone } from '../stores/notificationStore';
import { useNotificationStore } from '../stores/notificationStore';

/**
 * Raises an app-wide toast. The imperative entry point to the notification
 * store, callable from non-React code.
 */
export function notify(message: string, tone: NotificationTone = 'info'): void {
  useNotificationStore.getState().push(message, tone);
}
