import { NotificationTone } from '../stores/notificationStore';
import { useNotificationStore } from '../stores/notificationStore';

export function notify(message: string, tone: NotificationTone = 'info'): void {
  useNotificationStore.getState().push(message, tone);
}
